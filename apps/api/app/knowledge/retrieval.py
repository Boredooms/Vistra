"""Hybrid retrieval: vector top-40 + FTS top-40 -> RRF(k=60) -> max 2 chunks/document -> top-k.

Tenant + collection scope are enforced inside the SQL (and again by RLS); nothing is post-filtered.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import asdict, dataclass

from sqlalchemy import text

from app.ai.router import UsageCtx, get_router
from app.core.db import tenant_conn

RRF_K = 60
TOP_N = 40
PER_DOC = 2

# Evidence thresholds (tuned against the seeded corpus, see tests/test_rag_eval.py)
SIM_STRONG = 0.62      # semantic match alone is enough
SIM_WEAK = 0.45        # semantic match is enough only when FTS also hit


@dataclass
class Hit:
    chunk_id: str
    document_id: str
    title: str
    section: str | None
    anchor: str | None
    page: int | None
    content: str
    rrf: float
    cos_sim: float | None
    vector_rank: int | None
    fts_rank: int | None
    fts_score: float | None

    def passes(self, strong: float = SIM_STRONG, weak: float = SIM_WEAK) -> bool:
        s = self.cos_sim or 0.0
        return s >= strong or (self.fts_rank is not None and s >= weak)

    def to_debug(self, thresholds: tuple[float, float] = (SIM_STRONG, SIM_WEAK)) -> dict:
        d = asdict(self)
        d["content"] = self.content[:300]
        d["passes_threshold"] = self.passes(*thresholds)
        return d


SQL = text("""
with scope as (
  select kc.id from knowledge_collections kc
  join knowledge_bases kb on kb.id = kc.knowledge_base_id
  where kc.organization_id = :org
    and (cast(:app as text) is null or kb.application_id = :app)
    and (cast(:cols as uuid[]) is null or kc.id = any(cast(:cols as uuid[])))
), v as (
  select e.chunk_id, row_number() over (order by e.embedding <=> cast(:qv as vector)) as rnk
  from embeddings e join document_chunks c on c.id = e.chunk_id
  where e.organization_id = :org and e.index_version = 1 and c.collection_id in (select id from scope)
  order by e.embedding <=> cast(:qv as vector) limit 40
), f as (
  select c.id as chunk_id, ts_rank_cd(c.content_tsv, q.query) as score,
         row_number() over (order by ts_rank_cd(c.content_tsv, q.query) desc) as rnk
  from document_chunks c, websearch_to_tsquery('english', :tq) as q(query)
  where c.organization_id = :org and c.parent_chunk_id is not null
    and c.collection_id in (select id from scope) and c.content_tsv @@ q.query
  order by score desc limit 40
), fused as (
  select coalesce(v.chunk_id, f.chunk_id) as chunk_id, v.rnk as vrank, f.rnk as frank, f.score as fscore,
         coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + f.rnk), 0) as rrf
  from v full outer join f on f.chunk_id = v.chunk_id
), ranked as (
  select fz.chunk_id, fz.vrank, fz.frank, fz.fscore, fz.rrf, c.document_id, c.content, c.section_path, c.anchor, c.page,
         d.title, 1 - (e.embedding <=> cast(:qv as vector)) as cos_sim,
         row_number() over (partition by c.document_id order by fz.rrf desc) as doc_rank
  from fused fz
  join document_chunks c on c.id = fz.chunk_id
  join documents d on d.id = c.document_id
  left join embeddings e on e.chunk_id = fz.chunk_id
  where c.organization_id = :org
)
select * from ranked where doc_rank <= :per_doc order by rrf desc limit :k
""")


def fts_query(q: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", q)
    return " or ".join(words[:24]) or "x"


async def retrieve(org: str, application_id: str | None, query: str, run_id: str | None = None,
                   collection_ids: list[str] | None = None, k: int = 8) -> list[Hit]:
    res = await get_router().embed(UsageCtx(organization_id=org, run_id=run_id), [query], "RETRIEVAL_QUERY")
    qv = "[" + ",".join(f"{x:.7f}" for x in res.vectors[0]) + "]"
    cols = [uuid.UUID(c) for c in collection_ids] if collection_ids else None
    async with tenant_conn(org) as conn:
        rows = (await conn.execute(SQL, {"org": org, "app": application_id, "cols": cols, "qv": qv,
                                         "tq": fts_query(query), "per_doc": PER_DOC, "k": k})).mappings().all()
    return [Hit(chunk_id=str(r["chunk_id"]), document_id=str(r["document_id"]), title=r["title"], section=r["section_path"],
                anchor=r["anchor"], page=r["page"], content=r["content"], rrf=float(r["rrf"]),
                cos_sim=float(r["cos_sim"]) if r["cos_sim"] is not None else None,
                vector_rank=r["vrank"], fts_rank=r["frank"], fts_score=float(r["fscore"]) if r["fscore"] is not None else None)
            for r in rows]

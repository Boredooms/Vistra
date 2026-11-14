"""Ingestion pipeline: register -> fetch -> parse -> normalize -> chunk -> embed -> index.

Jobs are queued in Redis and executed by app.worker (embedded or standalone); without Redis they run in-process.
The ``ingestion_jobs`` row is the record; ``run_job`` is idempotent by content hash.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid

from sqlalchemy import text

from app.ai.router import UsageCtx, get_router
from app.core.db import tenant_conn
from app.knowledge.chunking import chunk_document
from app.knowledge.fetch import fetch_url
from app.knowledge.parsing import parse_source, slug

log = logging.getLogger("vistra.ingest")
EMBED_BATCH = 32
_tasks: set[asyncio.Task] = set()


async def create_source_and_job(org: str, collection_id: str, source_type: str, title: str | None,
                                url: str | None, content: str | None) -> tuple[str, str]:
    async with tenant_conn(org) as conn:
        col = (await conn.execute(text("select 1 from knowledge_collections where id = cast(:c as uuid) and organization_id = :o"),
                                  {"c": collection_id, "o": org})).first()
        if col is None:
            from app.core.errors import not_found
            raise not_found("Collection")
        sid = (await conn.execute(text(
            "insert into knowledge_sources (organization_id, collection_id, source_type, title, url, raw_content) "
            "values (:o, cast(:c as uuid), :t, :ti, :u, :r) returning id"),
            {"o": org, "c": collection_id, "t": source_type, "ti": title or url or "Untitled", "u": url, "r": content})).scalar_one()
        jid = (await conn.execute(text(
            "insert into ingestion_jobs (organization_id, source_id) values (:o, :s) returning id"),
            {"o": org, "s": sid})).scalar_one()
    return str(sid), str(jid)


async def schedule_job(org: str, job_id: str) -> str:
    """Queue the job for the worker (Redis). Without Redis, run it in-process. Returns the mode used."""
    from app.core.redis import INGEST_QUEUE, enqueue

    if await enqueue(INGEST_QUEUE, {"org": org, "job_id": job_id}):
        return "queued"
    t = asyncio.create_task(run_job(org, job_id))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return "inline"


async def _stage(org: str, job_id: str, stage: str, **extra) -> None:
    log.info("ingestion stage", extra={"ctx": {"job_id": job_id, "stage": stage, **extra}})
    async with tenant_conn(org) as conn:
        await conn.execute(text("update ingestion_jobs set stage = :s, status = 'running', stats = stats || cast(:x as jsonb) "
                                "where id = cast(:j as uuid)"), {"s": stage, "x": json.dumps(extra), "j": job_id})


async def _fail(org: str, job_id: str, err: str) -> None:
    async with tenant_conn(org) as conn:
        await conn.execute(text("update ingestion_jobs set status = 'failed', error = :e where id = cast(:j as uuid)"),
                           {"e": err[:500], "j": job_id})


async def run_job(org: str, job_id: str) -> None:
    try:
        await _run(org, job_id)
    except Exception as e:  # noqa: BLE001
        log.exception("ingestion failed")
        await _fail(org, job_id, f"{type(e).__name__}: {e}")


async def _run(org: str, job_id: str) -> None:
    async with tenant_conn(org) as conn:
        job = (await conn.execute(text(
            "update ingestion_jobs set status = 'running', attempt = attempt + 1, stage = 'fetch' "
            "where id = cast(:j as uuid) returning source_id"), {"j": job_id})).mappings().first()
        src = (await conn.execute(text(
            "select id, collection_id, source_type, title, url, raw_content from knowledge_sources where id = :s"),
            {"s": job["source_id"]})).mappings().first()
    raw = src["raw_content"]
    stype = src["source_type"]
    if stype == "url" and not raw:
        raw, ctype = await fetch_url(src["url"])
        if "html" not in ctype:
            stype = "text"
    # (crawl sources arrive with raw_content already fetched under robots/rate rules: parsed as html)
    await _stage(org, job_id, "parse")
    normalized, detected = parse_source(stype if stype != "url" else "html", raw or "")
    title = src["title"] if src["title"] and src["title"] != src["url"] else (detected or src["title"])
    if not normalized:
        raise ValueError("Source has no extractable text")
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    doc_slug = slug(title) or "doc"

    await _stage(org, job_id, "chunk")
    drafts = chunk_document(normalized, title, doc_slug)

    async with tenant_conn(org) as conn:
        existing = (await conn.execute(text(
            "select id, content_hash from documents where collection_id = :c and (title = :t or content_hash = :h)"),
            {"c": src["collection_id"], "t": title, "h": digest})).mappings().first()
        if existing and existing["content_hash"] == digest:
            await conn.execute(text("update ingestion_jobs set status='succeeded', stage='done', stats = stats || cast(:x as jsonb) "
                                    "where id = cast(:j as uuid)"), {"x": json.dumps({"skipped": "duplicate_content"}), "j": job_id})
            return
        version = 1
        if existing:
            version = 1 + (await conn.execute(text("select coalesce(max(version),0) from document_versions where document_id = :d"),
                                               {"d": existing["id"]})).scalar_one()
            await conn.execute(text("delete from document_chunks where document_id = :d"), {"d": existing["id"]})
            doc_id = existing["id"]
            await conn.execute(text("update documents set content_hash = :h, metadata = cast(:m as jsonb) where id = :d"),
                               {"h": digest, "m": json.dumps({"doc_slug": doc_slug}), "d": doc_id})
        else:
            doc_id = (await conn.execute(text(
                "insert into documents (organization_id, collection_id, source_id, title, content_hash, metadata) "
                "values (:o, :c, :s, :t, :h, cast(:m as jsonb)) returning id"),
                {"o": org, "c": src["collection_id"], "s": src["id"], "t": title, "h": digest,
                 "m": json.dumps({"doc_slug": doc_slug})})).scalar_one()
        ver_id = (await conn.execute(text(
            "insert into document_versions (organization_id, document_id, version, content_hash, normalized_text) "
            "values (:o, :d, :v, :h, :t) returning id"), {"o": org, "d": doc_id, "v": version, "h": digest, "t": normalized})).scalar_one()
        await conn.execute(text("update documents set current_version_id = :v where id = :d"), {"v": ver_id, "d": doc_id})
        await conn.execute(text("update knowledge_sources set content_hash = :h where id = :s"), {"h": digest, "s": src["id"]})

        ids = {d.index: uuid.uuid4() for d in drafts}
        await conn.execute(text(
                "insert into document_chunks (id, organization_id, collection_id, document_id, document_version_id, chunk_index, "
                "parent_chunk_id, content, token_count, section_path, anchor, page, content_hash, metadata) "
                "values (:id, :o, :c, :d, :v, :i, :p, :t, :tc, :sp, :an, :pg, :h, cast(:m as jsonb))"),
            [{"id": ids[d.index], "o": org, "c": src["collection_id"], "d": doc_id, "v": ver_id, "i": d.index,
                 "p": ids[d.parent_index] if d.parent_index is not None else None, "t": d.content, "tc": d.token_count,
                 "sp": d.section_path, "an": d.anchor, "pg": d.page, "h": d.content_hash,
              "m": json.dumps({"is_parent": d.is_parent})} for d in drafts])

    children = [d for d in drafts if not d.is_parent]
    await _stage(org, job_id, "embed", chunks=len(children))
    router = get_router()
    ctx = UsageCtx(organization_id=org)
    model_name, dim = "", 0
    rows = []
    for i in range(0, len(children), EMBED_BATCH):
        batch = children[i:i + EMBED_BATCH]
        res = await router.embed(ctx, [b.content for b in batch], "RETRIEVAL_DOCUMENT")
        model_name, dim = res.model, len(res.vectors[0])
        rows += [(ids[b.index], v) for b, v in zip(batch, res.vectors, strict=True)]

    await _stage(org, job_id, "index")
    async with tenant_conn(org) as conn:
        await conn.execute(text(
                "insert into embeddings (organization_id, chunk_id, model, dim, index_version, embedding) "
                "values (:o, :c, :m, :d, 1, cast(:v as vector))"),
            [{"o": org, "c": chunk_id, "m": model_name, "d": dim, "v": "[" + ",".join(f"{x:.7f}" for x in vec) + "]"} for chunk_id, vec in rows])
        await conn.execute(text(
            "update ingestion_jobs set status='succeeded', stage='done', stats = stats || cast(:x as jsonb) where id = cast(:j as uuid)"),
            {"x": json.dumps({"chunks": len(children), "model": model_name, "version": version}), "j": job_id})

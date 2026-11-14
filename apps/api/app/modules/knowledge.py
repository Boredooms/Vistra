from __future__ import annotations

import re
import uuid
from typing import Literal

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import tenant_conn
from app.core.errors import ProblemError, not_found, validation_error
from app.core.redis import rate_limit
from app.core.security import ApiKeyPrincipal, current_api_key
from app.knowledge import crawl, ingestion
from app.knowledge.retrieval import retrieve

router = APIRouter(prefix="/v1", tags=["knowledge"])
BUCKET = "documents-original"


class KbIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    application_id: str | None = None


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SourceIn(BaseModel):
    source_type: Literal["markdown", "text", "html", "url"]
    title: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, max_length=400_000)


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    collection_ids: list[uuid.UUID] | None = None
    top_k: int = Field(default=8, ge=1, le=20)


class PresignIn(BaseModel):
    collection_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=200)


class CompleteIn(BaseModel):
    collection_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=200)


def _safe_name(n: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", n)[:120]


@router.get("/knowledge-bases")
async def list_kbs(p: ApiKeyPrincipal = Depends(current_api_key)) -> list[dict]:
    p.require("knowledge:read")
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, name, description, application_id, created_at from knowledge_bases where organization_id = :o order by created_at"),
            {"o": p.organization_id})).mappings().all()
    return [{**r, "id": str(r["id"])} for r in rows]


@router.post("/knowledge-bases", status_code=201)
async def create_kb(body: KbIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:write")
    app_id = body.application_id or p.application_id
    async with tenant_conn(p.organization_id) as conn:
        ok = (await conn.execute(text("select 1 from applications where id = :a and organization_id = :o"),
                                 {"a": app_id, "o": p.organization_id})).first()
        if ok is None:
            raise not_found("Application")
        kid = (await conn.execute(text(
            "insert into knowledge_bases (organization_id, application_id, name, description) values (:o, :a, :n, :d) returning id"),
            {"o": p.organization_id, "a": app_id, "n": body.name, "d": body.description})).scalar_one()
    return {"id": str(kid), "name": body.name, "application_id": app_id}


@router.get("/knowledge-bases/{kb_id}/collections")
async def list_collections(kb_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> list[dict]:
    p.require("knowledge:read")
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select id, name, created_at from knowledge_collections where knowledge_base_id = :k and organization_id = :o order by created_at"),
            {"k": kb_id, "o": p.organization_id})).mappings().all()
    return [{**r, "id": str(r["id"])} for r in rows]


@router.post("/knowledge-bases/{kb_id}/collections", status_code=201)
async def create_collection(kb_id: uuid.UUID, body: CollectionIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:write")
    async with tenant_conn(p.organization_id) as conn:
        ok = (await conn.execute(text("select 1 from knowledge_bases where id = :k and organization_id = :o"),
                                 {"k": kb_id, "o": p.organization_id})).first()
        if ok is None:
            raise not_found("Knowledge base")
        cid = (await conn.execute(text(
            "insert into knowledge_collections (organization_id, knowledge_base_id, name) values (:o, :k, :n) returning id"),
            {"o": p.organization_id, "k": kb_id, "n": body.name})).scalar_one()
    return {"id": str(cid), "name": body.name}


@router.get("/collections/{collection_id}/sources")
async def list_sources(collection_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> list[dict]:
    p.require("knowledge:read")
    async with tenant_conn(p.organization_id) as conn:
        rows = (await conn.execute(text(
            "select s.id, s.source_type, s.title, s.url, s.content_hash, s.created_at, "
            "(select status from ingestion_jobs j where j.source_id = s.id order by j.created_at desc limit 1) as job_status, "
            "(select error from ingestion_jobs j where j.source_id = s.id order by j.created_at desc limit 1) as job_error, "
            "(select count(*) from document_chunks c join documents d on d.id = c.document_id where d.source_id = s.id and c.parent_chunk_id is not null) as chunks "
            "from knowledge_sources s where s.collection_id = :c and s.organization_id = :o order by s.created_at"),
            {"c": collection_id, "o": p.organization_id})).mappings().all()
    return [{**r, "id": str(r["id"])} for r in rows]


@router.post("/collections/{collection_id}/sources", status_code=202)
async def create_source(collection_id: uuid.UUID, body: SourceIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:write")
    if body.source_type == "url":
        if not body.url:
            raise validation_error("url is required for source_type=url")
    elif not body.content or not body.content.strip():
        raise validation_error("content is required for this source_type")
    sid, jid = await ingestion.create_source_and_job(p.organization_id, str(collection_id), body.source_type,
                                                     body.title, body.url, body.content)
    mode = await ingestion.schedule_job(p.organization_id, jid)
    return {"source_id": sid, "ingestion_job_id": jid, "status": "queued", "execution": mode}


class CrawlIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    depth: int = Field(default=1, ge=1, le=3, description="Link hops from the start page")
    max_pages: int = Field(default=20, ge=1, le=50)
    include_screenshots: bool = Field(default=False, alias="includeScreenshots")
    respect_robots: bool = Field(default=True, alias="respectRobots")

    model_config = {"populate_by_name": True}


@router.post("/knowledge-bases/{kb_id}/collections/{collection_id}/crawl", status_code=202)
async def crawl_site(kb_id: uuid.UUID, collection_id: uuid.UUID, body: CrawlIn,
                     p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    """Same-host crawl: SSRF-checked, robots.txt and noindex honoured, 1 request/second per host."""
    p.require("knowledge:write")
    await rate_limit(f"crawl:{p.organization_id}", 5, 3600)
    async with tenant_conn(p.organization_id) as conn:
        ok = (await conn.execute(text(
            "select 1 from knowledge_collections where id = :c and knowledge_base_id = :k and organization_id = :o"),
            {"c": collection_id, "k": kb_id, "o": p.organization_id})).first()
    if ok is None:
        raise not_found("Collection")
    st = await crawl.start(p.organization_id, str(collection_id), body.url, body.depth, body.max_pages, body.respect_robots,
                           body.include_screenshots)
    return {k: v for k, v in st.items() if k != "organization_id"}


@router.get("/crawls/{crawl_id}")
async def get_crawl(crawl_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:read")
    st = await crawl.get_state(str(crawl_id))
    if st is None or st.get("organization_id") != p.organization_id:
        raise not_found("Crawl")
    return {k: v for k, v in st.items() if k != "organization_id"}


@router.delete("/collections/{collection_id}/sources/{source_id}", status_code=204)
async def delete_source(collection_id: uuid.UUID, source_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> None:
    """Deleting a source cascades to its documents, chunks and embeddings."""
    p.require("knowledge:write")
    async with tenant_conn(p.organization_id) as conn:
        n = (await conn.execute(text("delete from knowledge_sources where id = :s and collection_id = :c and organization_id = :o"),
                                {"s": source_id, "c": collection_id, "o": p.organization_id})).rowcount
    if not n:
        raise not_found("Source")


@router.get("/ingestion-jobs/{job_id}")
async def get_job(job_id: uuid.UUID, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:read")
    async with tenant_conn(p.organization_id) as conn:
        r = (await conn.execute(text(
            "select id, source_id, status, stage, attempt, error, stats, created_at, updated_at from ingestion_jobs "
            "where id = :j and organization_id = :o"), {"j": job_id, "o": p.organization_id})).mappings().first()
    if r is None:
        raise not_found("Ingestion job")
    return {**r, "id": str(r["id"]), "source_id": str(r["source_id"])}


@router.post("/knowledge/search")
async def search(body: SearchIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    """Debug retrieval: chunks with vector rank/similarity, FTS rank/score, RRF score and the threshold verdict."""
    p.require("knowledge:read")
    hits = await retrieve(p.organization_id, p.application_id, body.query,
                          collection_ids=[str(c) for c in body.collection_ids] if body.collection_ids else None, k=body.top_k)
    return {"query": body.query, "results": [h.to_debug() for h in hits]}


# ---- file upload (Supabase Storage, private bucket, signed URLs) ----------------------------------
def _storage_headers() -> dict[str, str]:
    s = get_settings()
    if not s.supabase_url or not s.supabase_secret_key:
        raise ProblemError("CAPABILITY_UNAVAILABLE", 422, "Storage unavailable", "Supabase Storage is not configured")
    return {"Authorization": f"Bearer {s.supabase_secret_key}", "apikey": s.supabase_secret_key}


@router.post("/files/presign")
async def presign(body: PresignIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:write")
    s = get_settings()
    file_id = uuid.uuid4()
    path = f"{p.organization_id}/{body.collection_id}/{file_id}/{_safe_name(body.filename)}"
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{s.supabase_url}/storage/v1/object/upload/sign/{BUCKET}/{path}", headers=_storage_headers())
    if r.status_code >= 400:
        raise ProblemError("PROVIDER_UNAVAILABLE", 503, "Storage error", f"Signing failed ({r.status_code})")
    rel = r.json().get("url", "")
    return {"file_id": str(file_id), "path": path, "upload_url": f"{s.supabase_url}/storage/v1{rel}", "method": "PUT"}


@router.post("/files/{file_id}/complete", status_code=202)
async def complete(file_id: uuid.UUID, body: CompleteIn, p: ApiKeyPrincipal = Depends(current_api_key)) -> dict:
    p.require("knowledge:write")
    s = get_settings()
    path = f"{p.organization_id}/{body.collection_id}/{file_id}/{_safe_name(body.filename)}"  # org comes from the key, never the body
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{s.supabase_url}/storage/v1/object/{BUCKET}/{path}", headers=_storage_headers())
    if r.status_code == 404:
        raise not_found("Uploaded file")
    if r.status_code >= 400:
        raise ProblemError("PROVIDER_UNAVAILABLE", 503, "Storage error", f"Download failed ({r.status_code})")
    name = body.filename.lower()
    stype = "html" if name.endswith((".html", ".htm")) else "markdown" if name.endswith((".md", ".markdown")) else "text" if name.endswith(".txt") else None
    if stype is None:
        raise validation_error("Only .md, .txt and .html files are supported in this build")
    sid, jid = await ingestion.create_source_and_job(p.organization_id, str(body.collection_id), stype, body.filename, None, r.text)
    mode = await ingestion.schedule_job(p.organization_id, jid)
    return {"source_id": sid, "ingestion_job_id": jid, "status": "queued", "execution": mode}

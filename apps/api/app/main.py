from __future__ import annotations

import asyncio
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.errors import ProblemError
from app.core.logging import configure_logging, request_id_var

log = logging.getLogger("vistra.http")

if sys.platform == "win32":  # psycopg (LangGraph checkpointer) cannot run on the Proactor loop
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class RequestIdMiddleware:
    """Pure ASGI (does not buffer SSE): sets request id, logs one structured line per request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        rid = headers.get(b"x-request-id", b"").decode() or uuid.uuid4().hex
        request_id_var.set(rid[:64])
        start = time.perf_counter()
        status = {"code": 0}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", rid[:64].encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log.info("request", extra={"ctx": {"method": scope["method"], "path": scope["path"],
                                               "status": status["code"],
                                               "ms": round((time.perf_counter() - start) * 1000, 1)}})


def problem(status: int, code: str, title: str, detail: str = "") -> JSONResponse:
    return JSONResponse(
        {"type": f"https://docs.vistra.dev/errors/{code}", "title": title, "status": status, "detail": detail,
         "code": code, "request_id": request_id_var.get()},
        status_code=status, media_type="application/problem+json",
    )


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        from app.agent.graph import close_graph
        from app.core.redis import close_redis
        from app.worker import start_embedded_worker

        worker = start_embedded_worker() if s.worker_embedded else None
        yield
        if worker is not None:
            worker.cancel()
        await close_graph()
        await close_redis()
        await dispose_engine()

    app = FastAPI(title="VISTRA API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key", "X-Vistra-Application"],
        expose_headers=["X-Request-Id"],
        max_age=600,
    )
    app.add_middleware(RequestIdMiddleware)

    @app.exception_handler(ProblemError)
    async def _problem(_: Request, exc: ProblemError) -> JSONResponse:
        return problem(exc.status, exc.code, exc.title, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errs = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:5])
        return problem(422, "VALIDATION_ERROR", "Validation error", errs)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        return problem(exc.status_code, code, "Request failed", str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled", exc_info=exc)
        return problem(500, "INTERNAL_ERROR", "Internal error", "An unexpected error occurred")

    from app.modules import agents, applications, health, knowledge, runs, sdk

    app.include_router(health.router)
    app.include_router(applications.router)
    app.include_router(sdk.router)
    app.include_router(knowledge.router)
    app.include_router(runs.router)
    app.include_router(agents.router)
    return app


app = create_app()

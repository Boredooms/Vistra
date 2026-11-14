"""Local launcher. On Windows uvicorn picks the Proactor loop, which psycopg (LangGraph checkpointer) cannot use.
Production (Linux, Docker) runs plain `uvicorn app.main:app`.  Usage: uv run python run_dev.py [port]
"""
import asyncio
import selectors
import sys

import uvicorn

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=port, loop="none", log_level="info"))
if sys.platform == "win32":
    asyncio.run(server.serve(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
else:
    asyncio.run(server.serve())

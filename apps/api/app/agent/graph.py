"""VISTRA agent as a LangGraph state machine with a durable Postgres checkpointer.

    START -> plan --answer---------> answer -> END
                 --explain_element-> explain -> END
                 --explain_page----> explain_page (DOM text + optional screenshot via VISION) -> END
                 --guide-----------> guide -> END
                 --action----------> propose --allow-------------> execute --side effect--> verify -> END
                                            --require_approval--> approval (interrupt) --approved--> execute
                                                                                       --rejected--> END

* The model proposes in `plan`; `propose` asks the policy engine; the model never grants permission.
* `approval` calls langgraph `interrupt()`. State is checkpointed to Postgres (thread_id = run_id), so the run
  resumes from the checkpoint when POST /v1/sdk/approvals/{id} arrives, even after an API restart.
* `execute` and `verify` are separate checkpointed nodes: a crash after execution resumes at verification and
  never repeats the side effect (execute also claims the invocation row atomically).
* Non-serializable runtime objects (SSE emitter, principal) travel in the LangGraph runtime context, never in state.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any, TypedDict

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.core.config import get_settings
from app.core.errors import ProblemError
from app.runtime import orchestrator as orch

log = logging.getLogger("vistra.agent")
CHECKPOINT_SCHEMA = "agent_state"


class AgentState(TypedDict, total=False):
    user_text: str
    plan: dict[str, Any]
    page: dict[str, Any]
    intent: str
    invocation_id: str
    approval_id: str | None
    policy_decision: str
    approved: bool
    needs_verification: bool


@dataclass
class AgentContext:
    run: orch.RunCtx


def _ctx(runtime: Runtime[AgentContext]) -> orch.RunCtx:
    return runtime.context.run


# ---- nodes -------------------------------------------------------------------------------------
async def plan_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    plan, page = await orch.plan_run(_ctx(runtime), state["user_text"])
    return {"plan": plan, "page": page, "intent": plan["intent"]}


async def answer_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.flow_answer(_ctx(runtime), state["user_text"], state["plan"])
    return {}


async def explain_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.flow_explain(_ctx(runtime), state["user_text"], state["plan"], state.get("page") or {})
    return {}


async def explain_page_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.flow_explain_page(_ctx(runtime), state["user_text"], state["plan"], state.get("page") or {})
    return {}


async def guide_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.flow_guide(_ctx(runtime), state["plan"], state.get("page") or {})
    return {}


async def blocked_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.flow_blocked(_ctx(runtime), state["plan"])
    return {}


async def propose_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    r = await orch.flow_action(_ctx(runtime), state["plan"])  # raises POLICY_DENIED / TOOL_ARGS_INVALID
    return {"invocation_id": r["invocation_id"], "approval_id": r["approval_id"], "policy_decision": r["decision"]}


async def approval_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    # Nothing may run before interrupt(): the node is re-executed from the top on resume.
    decision = interrupt({"approval_id": state.get("approval_id"), "invocation_id": state["invocation_id"]})
    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    await orch.record_approval(_ctx(runtime), state["invocation_id"], approved)
    return {"approved": approved}


async def execute_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    return {"needs_verification": await orch.execute_tool(_ctx(runtime), state["invocation_id"])}


async def verify_node(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
    await orch.verify_tool(_ctx(runtime), state["invocation_id"])
    return {}


# ---- routing ------------------------------------------------------------------------------------
def route_intent(state: AgentState) -> str:
    return {"action": "propose", "guide": "guide", "explain_element": "explain", "explain_page": "explain_page",
            "blocked": "blocked"}.get(state.get("intent", ""), "answer")


def route_policy(state: AgentState) -> str:
    return "approval" if state.get("policy_decision") == "require_approval" else "execute"


def route_approval(state: AgentState) -> str:
    return "execute" if state.get("approved") else END


def route_execute(state: AgentState) -> str:
    return "verify" if state.get("needs_verification") else END


def _logged(name: str, fn):
    """Structured start/finish/fail log line per graph node (run_id, node, ms)."""
    import functools
    import time

    @functools.wraps(fn)
    async def wrapper(state: AgentState, runtime: Runtime[AgentContext]) -> AgentState:
        rid = runtime.context.run.run_id
        t0 = time.perf_counter()
        log.info("node start", extra={"ctx": {"run_id": rid, "node": name}})
        try:
            out = await fn(state, runtime)
        except Exception as e:
            if type(e).__name__ in ("GraphInterrupt", "Interrupt"):
                log.info("node interrupted (awaiting approval)", extra={"ctx": {"run_id": rid, "node": name}})
            else:
                log.warning("node failed", extra={"ctx": {"run_id": rid, "node": name, "error": type(e).__name__,
                                                          "ms": int((time.perf_counter() - t0) * 1000)}})
            raise
        log.info("node done", extra={"ctx": {"run_id": rid, "node": name, "ms": int((time.perf_counter() - t0) * 1000)}})
        return out

    return wrapper


def build_graph() -> StateGraph:
    g = StateGraph(AgentState, context_schema=AgentContext)
    for name, fn in (("plan", plan_node), ("answer", answer_node), ("explain", explain_node), ("explain_page", explain_page_node),
                     ("guide", guide_node), ("blocked", blocked_node),
                     ("propose", propose_node), ("approval", approval_node), ("execute", execute_node), ("verify", verify_node)):
        g.add_node(name, _logged(name, fn))
    g.add_edge(START, "plan")
    g.add_conditional_edges("plan", route_intent, ["answer", "explain", "explain_page", "guide", "propose", "blocked"])
    g.add_conditional_edges("propose", route_policy, ["approval", "execute"])
    g.add_conditional_edges("approval", route_approval, ["execute", END])
    g.add_conditional_edges("execute", route_execute, ["verify", END])
    for n in ("answer", "explain", "explain_page", "guide", "blocked", "verify"):
        g.add_edge(n, END)
    return g


# ---- checkpointer (Supabase Postgres, isolated schema) -----------------------------------------
_pool: AsyncConnectionPool | None = None
_compiled = None
_lock = asyncio.Lock()


def conninfo() -> str:
    url = get_settings().supabase_db_url
    local = "localhost" in url or "127.0.0.1" in url
    return url + ("" if local or "sslmode=" in url else ("&" if "?" in url else "?") + "sslmode=require")


async def _configure(conn) -> None:
    # Checkpoint tables live in their own schema; the tenant role (vistra_app) has no grants on it.
    await conn.execute(f"set search_path to {CHECKPOINT_SCHEMA}")


async def get_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(conninfo(), min_size=1, max_size=int(os.environ.get("CHECKPOINT_POOL_MAX", "2")), open=False,
                                    configure=_configure, max_idle=120,
                                    check=AsyncConnectionPool.check_connection,
                                    kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row})
        await _pool.open(wait=True, timeout=30)
    return _pool


async def get_graph():
    global _compiled
    async with _lock:
        if _compiled is None:
            saver = AsyncPostgresSaver(await get_pool())
            _compiled = build_graph().compile(checkpointer=saver)
    return _compiled


async def setup_checkpointer() -> None:
    """Explicit release step (scripts/migrate.py): creates/upgrades LangGraph's checkpoint tables."""
    pool = AsyncConnectionPool(conninfo(), min_size=1, max_size=1, open=False, configure=_configure,
                               kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row})
    await pool.open(wait=True, timeout=30)
    try:
        await AsyncPostgresSaver(pool).setup()
    finally:
        await pool.close()


async def close_graph() -> None:
    global _pool, _compiled
    if _pool is not None:
        await _pool.close()
    _pool, _compiled = None, None


# ---- runners (background producers for SSE responses) -------------------------------------------
async def _drive(ctx: orch.RunCtx, payload: Any) -> None:
    try:
        graph = await get_graph()
        await graph.ainvoke(payload, {"configurable": {"thread_id": ctx.run_id}}, context=AgentContext(ctx), durability="sync")
    except orch.RunCancelled:
        await orch.store.update_run(ctx.org, ctx.run_id, status="cancelled")
        await ctx.em.emit("run.cancelled", {})
    except ProblemError as e:
        await orch.fail(ctx, e.code, e.detail or e.title, e.status)
    except Exception as e:  # noqa: BLE001
        log.exception("agent run crashed")
        await orch.fail(ctx, "INTERNAL_ERROR", type(e).__name__)
    finally:
        await ctx.em.flush()  # events durable before the client sees the end of the stream
        ctx.em.close()


async def start_run(ctx: orch.RunCtx, user_text: str) -> None:
    await _drive(ctx, {"user_text": user_text})


async def resume_run(ctx: orch.RunCtx, approved: bool) -> None:
    await _drive(ctx, Command(resume={"approved": approved}))

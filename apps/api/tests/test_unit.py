from __future__ import annotations

import time

import jwt
import pytest

from app.ai.base import Capability, ProviderError
from app.ai.fake import FakeProvider
from app.ai.router import BREAKER_THRESHOLD, Router, UsageCtx
from app.core.config import get_settings
from app.core.errors import ProblemError
from app.core.security import canonical, decode_sdk_token, mint_sdk_token, sign_tool_call
from app.knowledge.answer import INSUFFICIENT, validate
from app.knowledge.chunking import chunk_document
from app.knowledge.parsing import html_to_markdown, slug
from app.knowledge.retrieval import Hit, fts_query
from app.runtime import tools


# ---- tokens ----------------------------------------------------------------------------------------
def test_token_roundtrip():
    c = decode_sdk_token(mint_sdk_token("app", "org", "sess"))
    assert (c["aud"], c["app_id"], c["org_id"], c["session_id"]) == ("sdk", "app", "org", "sess")
    assert c["exp"] - c["iat"] == 900


def test_token_expired():
    tok = mint_sdk_token("app", "org", "s", now=int(time.time()) - 2000)
    with pytest.raises(ProblemError) as e:
        decode_sdk_token(tok)
    assert e.value.code == "SESSION_EXPIRED" and e.value.status == 401


def test_token_wrong_audience_and_signature():
    from app.core.security import _sdk_key
    bad_aud = jwt.encode({"aud": "other", "app_id": "a", "org_id": "o", "session_id": "s", "exp": int(time.time()) + 60}, _sdk_key(), "HS256")
    with pytest.raises(ProblemError) as e:
        decode_sdk_token(bad_aud)
    assert e.value.code == "AUTH_INVALID_ISSUER"
    forged = jwt.encode({"aud": "sdk", "app_id": "a", "org_id": "o", "session_id": "s", "exp": int(time.time()) + 60}, "x" * 32, "HS256")
    with pytest.raises(ProblemError):
        decode_sdk_token(forged)


def test_tool_signature_matches_canonical_form():
    args = {"name": "Website Redesign"}
    assert canonical({"tool": "t", "args": args, "run_id": "r", "ts": 1}) == b'{"args":{"name":"Website Redesign"},"run_id":"r","tool":"t","ts":1}'
    assert sign_tool_call("t", args, "r", 1) == sign_tool_call("t", {"name": "Website Redesign"}, "r", 1)
    assert sign_tool_call("t", args, "r", 1) != sign_tool_call("t", {"name": "Other"}, "r", 1)


# ---- policy ----------------------------------------------------------------------------------------
def test_policy_decisions():
    assert tools.decide("create_project", "admin")[0] == "require_approval"
    assert tools.decide("invite_member", "admin")[0] == "allow"
    assert tools.decide("invite_member", "viewer")[0] == "deny"
    assert tools.decide("drop_database", "owner")[0] == "deny"  # unregistered => deny
    assert tools.decide("list_projects", "viewer")[0] == "allow"


def test_tool_args_validation():
    assert tools.validate_args("create_project", {"name": "X"}) == {"name": "X"}
    with pytest.raises(ProblemError) as e:
        tools.validate_args("create_project", {"name": ""})
    assert e.value.code == "TOOL_ARGS_INVALID"
    with pytest.raises(ProblemError):
        tools.validate_args("invite_member", {"name": "a", "email": "nope"})


def test_verify_present_requires_matching_record():
    res = {"id": "1", "name": "A"}
    assert tools.verify_present("create_project", {"name": "A"}, res, {"projects": [{"id": "1", "name": "A"}]})[0]
    assert not tools.verify_present("create_project", {"name": "A"}, res, {"projects": [{"id": "2", "name": "A"}]})[0]
    assert not tools.verify_present("create_project", {"name": "A"}, res, {"projects": []})[0]


# ---- chunking / parsing / citations ----------------------------------------------------------------
def test_chunking_is_heading_aware_with_parents():
    text = "# Doc\n\n## A\n\nalpha body\n\n## B\n\nbeta body"
    ch = chunk_document(text, "Doc", "doc")
    parents = [c for c in ch if c.is_parent]
    kids = [c for c in ch if not c.is_parent]
    assert len(parents) == 2 and len(kids) == 2
    assert kids[0].section_path == "Doc > A" and kids[0].anchor == "doc--a"
    assert kids[0].parent_index == parents[0].index


def test_long_section_splits_with_overlap():
    body = "\n\n".join(f"Paragraph {i}. " + "word " * 200 for i in range(12))
    kids = [c for c in chunk_document(f"# T\n\n## S\n\n{body}", "T", "t") if not c.is_parent]
    assert len(kids) > 1
    assert all(k.token_count <= 900 for k in kids)


def test_html_parse_and_slug():
    md, title = html_to_markdown("<html><head><title>Hi</title></head><body><nav>skip</nav><h2>Part One</h2><p>x</p><ul><li>y</li></ul></body></html>")
    assert title == "Hi" and "## Part One" in md and "- y" in md and "skip" not in md
    assert slug("Acme Workspace Pricing") == "acme-workspace-pricing"


def test_fts_query_is_or_of_terms():
    assert fts_query("What is the Starter plan?") == "What or is or the or Starter or plan"


def _hit(i: int) -> Hit:
    return Hit(f"chunk{i}", "doc", "Title", "Title > S", f"t--s{i}", None, "content", 0.03, 0.8, 1, 1, 0.5)


def test_citation_validation_strips_unknown_and_flags_uncited():
    ids = {"c1": _hit(1)}
    answer, cits, insufficient, uncited, warns = validate("Costs $12 [c1]. Also free forever [c9].", False, ids)
    assert not insufficient and [c["id"] for c in cits] == ["c1"]
    assert "[c9]" not in answer and uncited == 1 and any("c9" in w for w in warns)


def test_answer_without_valid_citation_is_refused():
    answer, cits, insufficient, _, _ = validate("Costs $12 with no citation.", False, {"c1": _hit(1)})
    assert insufficient and answer == INSUFFICIENT and cits == []
    answer, _, insufficient, _, _ = validate("Costs $12 [c7].", False, {"c1": _hit(1)})
    assert insufficient


# ---- provider router -------------------------------------------------------------------------------
class NoEmbed(FakeProvider):
    capabilities = {Capability.TEXT, Capability.FAST, Capability.STRUCTURED}


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture
def stub_usage(monkeypatch):
    async def noop(self, ctx, t, res):  # no DB in these unit tests
        self.recorded.append(t)
    Router.recorded = []
    monkeypatch.setattr(Router, "_record", noop)
    yield Router.recorded


@pytest.mark.asyncio
async def test_fallback_on_retryable_failure_is_traced(stub_usage):
    r = Router(FakeProvider("primary", fail=True), FakeProvider("secondary"), get_settings(), sleep=_no_sleep)
    res = await r.generate_text(UsageCtx("o"), "hi", "sys")
    assert res.provider == "secondary" and res.fallback_used
    assert [t.status for t in res.traces] == ["failed", "failed", "failed", "ok"]  # 1 try + 2 retries, then fallback


class AuthFail(FakeProvider):
    async def generate_text(self, prompt, system, fast=False):
        raise ProviderError("auth", "bad key", False)


@pytest.mark.asyncio
async def test_invalid_credentials_fail_closed_without_fallback(stub_usage):
    r = Router(AuthFail("primary"), FakeProvider("secondary"), get_settings(), sleep=_no_sleep)
    with pytest.raises(ProblemError) as e:
        await r.generate_text(UsageCtx("o"), "hi", "sys")
    assert e.value.code == "PROVIDER_CONFIGURATION_ERROR"
    assert [t.provider for t in stub_usage] == ["primary"]


@pytest.mark.asyncio
async def test_no_silent_capability_downgrade(stub_usage):
    r = Router(NoEmbed("nv"), None, get_settings(), sleep=_no_sleep)
    with pytest.raises(ProblemError) as e:
        await r.embed(UsageCtx("o"), ["x"], "RETRIEVAL_QUERY")
    assert e.value.code == "CAPABILITY_UNAVAILABLE"
    # a fallback that lacks the capability is not used either
    r2 = Router(FakeProvider("primary", fail=True), NoEmbed("nv"), get_settings(), sleep=_no_sleep)
    with pytest.raises(ProblemError) as e2:
        await r2.embed(UsageCtx("o"), ["x"], "RETRIEVAL_QUERY")
    assert e2.value.code == "PROVIDER_UNAVAILABLE"
    assert all(t.provider == "primary" for t in stub_usage if t.capability == "embedding.text")


@pytest.mark.asyncio
async def test_breaker_opens_after_five_failures(stub_usage):
    r = Router(FakeProvider("primary", fail=True), None, get_settings(), sleep=_no_sleep)
    with pytest.raises(ProblemError):
        await r.generate_text(UsageCtx("o"), "a", "s")
    with pytest.raises(ProblemError):
        await r.generate_text(UsageCtx("o"), "a", "s")
    assert r.breakers[("primary", "generate")].failures >= BREAKER_THRESHOLD
    assert any(t.error_class == "circuit_open" for t in stub_usage)

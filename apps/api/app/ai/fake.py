"""Deterministic provider for AI_PROVIDER_MODE=fake and tests.

Everything downstream (retrieval, citations, policy, approvals, verification) stays real. The output is
extractive/rule-based, always labeled as simulated in the UI via ``served_by.simulated``.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

from app.ai.base import Capability, EmbedResult, GenResult, ProviderError

DIM = 768
_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "is", "in", "of", "to", "and", "what", "how", "do", "does", "i", "my", "me", "for", "on",
         "it", "this", "that", "are", "be", "with", "can", "you", "show", "included", "include"}


def _words(s: str) -> list[str]:
    return [w for w in _WORD.findall(s.lower()) if w not in _STOP]


def hash_embed(text: str) -> list[float]:
    vec = [0.0] * DIM
    for w in _words(text):
        h = int(hashlib.sha256(w.encode()).hexdigest(), 16)
        vec[h % DIM] += 1.0
        vec[(h >> 20) % DIM] += 0.5
    n = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / n for x in vec]


class FakeProvider:
    capabilities = {Capability.TEXT, Capability.FAST, Capability.STRUCTURED, Capability.EMBED, Capability.VISION}

    def __init__(self, name: str = "fake", fail: bool = False) -> None:
        self.name = name
        self.fail = fail
        self.model = f"{name}-deterministic-v1"

    async def generate_text(self, prompt: str, system: str, fast: bool = False) -> GenResult:
        if self.fail:
            raise ProviderError("upstream_5xx", "fake provider forced failure", True)
        return GenResult(text="[simulated] " + prompt[:200], model=self.model, input_tokens=len(prompt) // 4, output_tokens=20)

    async def generate_structured(self, prompt: str, system: str, schema: dict[str, Any], fast: bool = False) -> GenResult:
        if self.fail:
            raise ProviderError("upstream_5xx", "fake provider forced failure", True)
        kind = schema.get("title")
        out = (self._plan(prompt) if kind == "plan" else self._answer(prompt) if kind == "answer"
               else self._explain(prompt) if kind == "explain" else self._page(prompt) if kind == "page" else {})
        return GenResult(text=json.dumps(out), model=self.model, input_tokens=len(prompt) // 4, output_tokens=40, parsed=out)

    async def generate_vision(self, prompt: str, system: str, image: str, schema: dict[str, Any]) -> GenResult:
        """Simulated vision: the image is NOT analysed; output comes from the page text and is labelled as simulated."""
        if self.fail:
            raise ProviderError("upstream_5xx", "fake provider forced failure", True)
        out = self._page(prompt)
        out["page_summary"] = "[simulated vision] " + out["page_summary"]
        return GenResult(text=json.dumps(out), model=self.model + "-simulated-vision", input_tokens=len(prompt) // 4,
                         output_tokens=40, parsed=out)

    def _page(self, prompt: str) -> dict[str, Any]:
        title = (re.search(r"PAGE: title=([^;\n]*)", prompt) or re.search(r"()", "")).group(1).strip()
        controls = re.findall(r'(\w+) "([^"]+)"', (re.search(r"CONTROLS: (.*)", prompt) or re.search(r"()", "")).group(1))
        cite = self._answer(prompt.replace("QUESTION:", "QUESTION: " + title, 1))
        return {"page_summary": f"This page is \"{title or 'untitled'}\".",
                "main_actions": [{"label": n, "what_it_does": f"A {r} on this page."} for r, n in controls[:5]],
                "business_meaning": "" if cite["insufficient_evidence"] else cite["answer"],
                "suggested_next_step": "", "cited": cite["cited"], "insufficient_evidence": cite["insufficient_evidence"]}

    async def embed(self, texts: list[str], task: str) -> EmbedResult:
        if self.fail:
            raise ProviderError("upstream_5xx", "fake provider forced failure", True)
        return EmbedResult(vectors=[hash_embed(t) for t in texts], model="fake-hash-768")

    # ---- rule-based planner -------------------------------------------------------------------
    def _plan(self, prompt: str) -> dict[str, Any]:
        m = re.search(r"USER_REQUEST:\s*(.*)", prompt)
        req = (m.group(1) if m else prompt).strip()
        low = req.lower()
        plan: dict[str, Any] = {"intent": "answer", "continues_on_next_page": False, "query": req,
                                "summary": "Answering from the knowledge base.",
                                "tool_name": "", "tool_args_json": "{}", "guide_goal": "", "guide_steps": []}
        has_sel = "SELECTION: none" not in prompt and "SELECTION:" in prompt
        pc = re.search(r"create (?:a )?project(?: called| named)?\s+[\"']?(.+?)[\"']?\s*$", req, re.I)
        inv = re.search(r"invite\s+(\S+)\s+(\S+@\S+)", req, re.I)
        if pc:
            plan.update(intent="action", tool_name="create_project", tool_args_json=json.dumps({"name": pc.group(1).strip()}),
                        summary=f"Create the project '{pc.group(1).strip()}'.")
        elif inv:
            plan.update(intent="action", tool_name="invite_member",
                        tool_args_json=json.dumps({"name": inv.group(1), "email": inv.group(2)}),
                        summary="Invite a team member.")
        elif re.search(r"\b(show|guide|walk|how (do|can) i)\b.*\binvite\b", low) or "invite a teammate" in low:
            plan.update(intent="guide", guide_goal="Invite a teammate", summary="I'll walk you through inviting a teammate.",
                        guide_steps=[
                            {"target_id": "nav.team", "instruction": "Open the Team page.", "action": "click", "reason": "Team members are managed from the Team page."},
                            {"target_id": "team.invite", "instruction": "Click Invite member.", "action": "click", "reason": "This opens the invitation form."},
                            {"target_id": "invite.name", "instruction": "Enter the teammate's name here.", "action": "type"},
                        ])
        elif re.search(r"\b(this page|this screen|my screen|what am i looking at)\b", low):
            plan.update(intent="explain_page", summary="Explaining this page.")
        elif has_sel and re.search(r"\b(this|mean|what is|explain)\b", low):
            plan.update(intent="explain_element", summary="Explaining the selected element.")
        return plan

    def _explain(self, prompt: str) -> dict[str, Any]:
        m = re.search(r"ELEMENT:\s*(.*)", prompt)
        fields = dict(re.findall(r"(\w+)=([^;]*)", m.group(1))) if m else {}
        summary = (f"The selected element is a {fields.get('role', 'control')} named \"{fields.get('name', '')}\" "
                   f"with visible text \"{fields.get('text', '')}\".")
        qwords = set(_words(fields.get("text", "") + " " + fields.get("name", "")))
        biz, cited = "", []
        for cid, body in re.findall(r"\[(c\d+)\][^\n]*\n(.*?)(?=\n\[c\d+\]|\Z)", prompt, re.S):
            if qwords & set(_words(body)):
                sent = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", body) if qwords & set(_words(s))]
                if sent:
                    biz, cited = f"{sent[0]} [{cid}]", [cid]
                    break
        return {"element_summary": summary, "what_it_does": f"It is a {fields.get('role', 'control')} you can interact with.",
                "business_meaning": biz, "suggested_next_step": "", "cited": cited, "insufficient_evidence": not biz}

    def _answer(self, prompt: str) -> dict[str, Any]:
        q = re.search(r"QUESTION:\s*(.*)", prompt)
        qwords = set(_words(q.group(1) if q else ""))
        blocks = re.findall(r"\[(c\d+)\][^\n]*\n(.*?)(?=\n\[c\d+\]|\Z)", prompt, re.S)
        best, best_score = None, 0
        for cid, body in blocks:
            sc = len(qwords & set(_words(body)))
            if sc > best_score:
                best, best_score = (cid, body), sc
        if best is None or best_score == 0:
            return {"answer": "I could not find this in the provided knowledge.", "used_chunks": [], "cited": [], "insufficient_evidence": True}
        cid, body = best
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", body) if s.strip()]
        ranked = sorted(sentences, key=lambda s: -len(qwords & set(_words(s))))[:3]
        txt = " ".join(ranked)
        return {"answer": f"{txt} [{cid}]", "used_chunks": [cid], "cited": [cid], "insufficient_evidence": False}

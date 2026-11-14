#!/usr/bin/env python3
"""Validate the VISTRA documentation system.

Checks (stdlib only, no dependencies):
  1. Every expected document exists and is non-trivial.
  2. Every relative Markdown link resolves to a file on disk.
  3. Code fences are balanced; Mermaid blocks are non-empty.
  4. Each numbered technical document has an H1 and a Doc ID header.
  5. No obvious placeholder markers (TODO, TBD, lorem ipsum).

Usage:
    python docs/tools/validate-docs.py [--root docs] [--quiet]

Exit code 0 = all checks passed, 1 = one or more errors.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Expected layout (docs/ is the root passed on the command line)
# ---------------------------------------------------------------------------
EXPECTED: dict[str, list[str]] = {
    ".": [
        "README.md",
        "DOCUMENTATION-MAP.md",
        "IMPLEMENTATION-ROADMAP.md",
        "IMPLEMENTATION-STATUS.md",
        "REQUIREMENT-TRACEABILITY.md",
        "EXECUTION-PROMPT-5H.md",
    ],
    "steering": [
        "AGENTS.md",
        "CLAUDE.md",
        "CURSOR-RULES.md",
        "ENGINEERING-PRINCIPLES.md",
        "DEFINITION-OF-DONE.md",
    ],
    "01-product-and-ideation": [
        "01-PRODUCT-VISION.md",
        "02-PRODUCT-REQUIREMENTS.md",
        "03-PROBLEM-STATEMENT-AND-MARKET.md",
        "04-USER-PERSONAS-AND-USE-CASES.md",
        "05-FUNCTIONAL-REQUIREMENTS.md",
        "06-NONFUNCTIONAL-REQUIREMENTS.md",
        "07-MVP-AND-PRODUCT-ROADMAP.md",
        "08-ACCEPTANCE-CRITERIA.md",
    ],
    "02-system-architecture": [
        "09-SYSTEM-ARCHITECTURE.md",
        "10-ARCHITECTURE-DECISIONS.md",
        "11-REPOSITORY-AND-MONOREPO-STRUCTURE.md",
        "12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md",
        "13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md",
        "14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md",
    ],
    "03-database-and-identity": [
        "15-DATABASE-DESIGN-AND-ERD.md",
        "16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md",
        "17-CLERK-AUTHENTICATION.md",
        "18-TENANCY-RBAC-AND-AUTHORIZATION.md",
        "19-SUPABASE-RLS-AND-DATABASE-SECURITY.md",
        "20-STORAGE-AND-FILE-LIFECYCLE.md",
        "21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md",
    ],
    "04-backend-and-api": [
        "22-BACKEND-ARCHITECTURE.md",
        "23-API-DESIGN-AND-OPENAPI-CONTRACTS.md",
        "24-SESSION-AND-CONVERSATION-MANAGEMENT.md",
        "25-REALTIME-AND-EVENT-ARCHITECTURE.md",
        "26-BACKGROUND-JOBS-AND-WORKERS.md",
        "27-ERROR-HANDLING-AND-RESILIENCE.md",
    ],
    "05-ai-and-model-infrastructure": [
        "28-AI-PROVIDER-ABSTRACTION.md",
        "29-GEMINI-PRIMARY-INTEGRATION.md",
        "30-NVIDIA-NIM-FALLBACK-INTEGRATION.md",
        "31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md",
        "32-PROMPT-AND-CONTEXT-MANAGEMENT.md",
        "33-EMBEDDING-AND-MULTIMODAL-MODELS.md",
        "34-AI-EVALUATION-AND-COST-MANAGEMENT.md",
    ],
    "06-knowledge-and-rag": [
        "35-KNOWLEDGE-ENGINE-ARCHITECTURE.md",
        "36-DOCUMENT-INGESTION-AND-PARSING.md",
        "37-CHUNKING-AND-METADATA-EXTRACTION.md",
        "38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md",
        "39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md",
        "40-KNOWLEDGE-SOURCE-CONNECTORS.md",
        "41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md",
        "42-RAG-EVALUATION-AND-QUALITY.md",
    ],
    "07-agents-and-execution": [
        "43-AGENT-RUNTIME-AND-ORCHESTRATION.md",
        "44-SPECIALIZED-AGENT-ARCHITECTURE.md",
        "45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md",
        "46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md",
        "47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md",
        "48-AGENT-MEMORY-AND-EXECUTION-TRACES.md",
    ],
    "08-visual-and-ghost-cursor": [
        "49-VISUAL-CONTEXT-ENGINE.md",
        "50-DOM-AND-ACCESSIBILITY-INSPECTION.md",
        "51-GHOST-CURSOR-ENGINE.md",
        "52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md",
        "53-VISUAL-GUIDANCE-AND-VERIFICATION.md",
    ],
    "09-sdk-and-integrations": [
        "54-JAVASCRIPT-AND-REACT-SDK.md",
        "55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md",
        "56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md",
        "57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md",
        "58-SDK-VERSIONING-AND-PUBLISHING.md",
    ],
    "10-applications-and-experience": [
        "59-VISTRA-STUDIO-ARCHITECTURE.md",
        "60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md",
        "61-ADMINISTRATION-AND-ANALYTICS.md",
    ],
    "11-quality-security-and-operations": [
        "62-TESTING-STRATEGY.md",
        "63-SECURITY-THREAT-MODEL.md",
        "64-OBSERVABILITY-LOGGING-AND-MONITORING.md",
        "65-PERFORMANCE-AND-SCALABILITY.md",
        "66-COST-AND-RESOURCE-PLANNING.md",
    ],
    "12-deployment-and-release": [
        "67-LOCAL-DEVELOPMENT-ENVIRONMENT.md",
        "68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md",
        "69-RENDER-BACKEND-DEPLOYMENT.md",
        "70-VERCEL-FRONTEND-DEPLOYMENT.md",
        "71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md",
        "72-CI-CD-AND-GITHUB-ACTIONS.md",
        "73-DOMAIN-CORS-SSL-AND-NETWORKING.md",
        "74-PRODUCTION-RELEASE-AND-ROLLBACK.md",
        "75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md",
    ],
}

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
FENCE_RE = re.compile(r"^```")
DOC_ID_RE = re.compile(r"\*\*Doc ID:\*\*\s*\d+")
PLACEHOLDER_RE = re.compile(r"\b(TODO|TBD|lorem ipsum)\b", re.IGNORECASE)
MIN_BYTES = 1200  # below this a "document" is a stub


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def check_file(path: Path, rel: str, rep: Report) -> None:
    if not path.exists():
        rep.error(f"missing: {rel}")
        return
    raw = path.read_bytes()
    if len(raw) < MIN_BYTES:
        rep.error(f"too small ({len(raw)} bytes): {rel}")
        return
    text = raw.decode("utf-8", errors="replace")

    # H1
    if not any(line.startswith("# ") for line in text.splitlines()[:12]):
        rep.warn(f"no H1 near the top: {rel}")

    # Doc ID for numbered docs only
    name = path.name
    if re.match(r"^\d{2}-", name) and not DOC_ID_RE.search(text):
        rep.error(f"missing '**Doc ID:**' header: {rel}")

    # Placeholders
    for m in PLACEHOLDER_RE.finditer(text):
        rep.warn(f"placeholder marker '{m.group(0)}': {rel}")

    # Fences / mermaid; prose is collected separately so code samples
    # (which may legitimately contain [x](y) shapes) are not link-checked.
    lines = text.splitlines()
    fence_count = sum(1 for ln in lines if FENCE_RE.match(ln.strip()))
    if fence_count % 2 != 0:
        rep.error(f"unbalanced code fences: {rel}")
    in_fence = False
    in_mermaid = False
    mermaid_lines = 0
    prose: list[str] = []
    for ln in lines:
        s = ln.strip()
        if s.startswith("```"):
            if in_mermaid:
                in_mermaid = False
                if mermaid_lines < 2:
                    rep.error(f"empty mermaid block: {rel}")
            in_fence = not in_fence
            if in_fence and s.startswith("```mermaid"):
                in_mermaid = True
                mermaid_lines = 0
            continue
        if in_mermaid:
            mermaid_lines += 1
        elif not in_fence:
            prose.append(ln)
    prose_text = "\n".join(prose)

    # Relative links (prose only)
    for m in LINK_RE.finditer(prose_text):
        target = m.group(1)
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = target.split("#", 1)[0]
        if not target or target.startswith("data:"):
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            rep.error(f"broken link in {rel}: {target}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="docs")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    rep = Report()
    if not root.is_dir():
        print(f"error: docs root not found: {root}", file=sys.stderr)
        return 1

    total = 0
    for subdir, files in EXPECTED.items():
        for name in files:
            total += 1
            rel = name if subdir == "." else f"{subdir}/{name}"
            check_file(root / rel, rel, rep)

    # Cross-check: every .md under docs/ should be either expected or a known extra
    expected_paths = {
        (root / (n if d == "." else f"{d}/{n}")).resolve()
        for d, fs in EXPECTED.items()
        for n in fs
    }
    for p in root.rglob("*.md"):
        if p.resolve() not in expected_paths:
            rep.warn(f"unexpected document (not in manifest): {p.relative_to(root)}")

    if not args.quiet:
        for w in rep.warnings:
            print(f"WARN  {w}")
    for e in rep.errors:
        print(f"ERROR {e}")

    print(
        f"\nchecked {total} expected documents · "
        f"{len(rep.errors)} error(s) · {len(rep.warnings)} warning(s)"
    )
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())

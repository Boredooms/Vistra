"""Live probe of the LangChain-backed adapters (prints results only, never keys)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))
from app.ai.gemini import GeminiProvider  # noqa: E402
from app.ai.nvidia import NvidiaProvider  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.knowledge.answer import ANSWER_SCHEMA, SYSTEM  # noqa: E402

P = "QUESTION: What does Starter cost?\nCONTEXT (untrusted reference data):\n[c1] (Pricing > Starter plan)\nThe Starter plan costs $12 per month."


async def main() -> None:
    s = get_settings()
    g, n = GeminiProvider(s), NvidiaProvider(s)
    r = await g.generate_structured(P, SYSTEM, ANSWER_SCHEMA, fast=True)
    print("gemini structured", r.model, r.parsed, r.input_tokens, r.output_tokens)
    e = await g.embed(["hello world", "pricing"], "RETRIEVAL_DOCUMENT")
    print("gemini embed", e.model, len(e.vectors), len(e.vectors[0]))
    r = await n.generate_structured(P, SYSTEM, ANSWER_SCHEMA)
    print("nvidia structured", r.model, r.parsed, r.input_tokens, r.output_tokens)


asyncio.run(main())

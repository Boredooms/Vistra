"""Heading-aware, parent/child chunking (~800 token children, 15% overlap)."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from app.knowledge.parsing import slug

CHILD_TOKENS = 800
OVERLAP = 0.15
CHARS_PER_TOKEN = 4  # documented approximation; avoids a tokenizer dependency


def est_tokens(s: str) -> int:
    return max(1, len(s) // CHARS_PER_TOKEN)


@dataclass
class ChunkDraft:
    index: int
    content: str
    section_path: str
    anchor: str
    parent_index: int | None
    token_count: int
    content_hash: str
    is_parent: bool = False
    page: int | None = None
    metadata: dict = field(default_factory=dict)


_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def split_sections(text: str, doc_title: str) -> list[tuple[str, int, str]]:
    """-> [(section_path, level, body)] where body excludes heading lines."""
    stack: list[tuple[int, str]] = []
    sections: list[tuple[str, int, list[str]]] = [(doc_title, 0, [])]
    for line in text.split("\n"):
        m = _HEADING.match(line)
        if m:
            level, title = len(m.group(1)), m.group(2)
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
            path = " > ".join([doc_title] + [t for _, t in stack if t != doc_title])
            sections.append((path, level, []))
        else:
            sections[-1][2].append(line)
    out = []
    for path, level, body in sections:
        b = "\n".join(body).strip()
        if b:
            out.append((path, level, b))
    return out


def _windows(body: str) -> list[str]:
    max_chars = CHILD_TOKENS * CHARS_PER_TOKEN
    if len(body) <= max_chars:
        return [body]
    paras = [p for p in re.split(r"\n\s*\n", body) if p.strip()]
    wins: list[str] = []
    cur = ""
    for p in paras:
        # hard-split an oversized paragraph on sentence boundaries
        parts = [p] if len(p) <= max_chars else re.split(r"(?<=[.!?])\s+", p)
        for part in parts:
            if cur and len(cur) + len(part) + 2 > max_chars:
                wins.append(cur)
                tail = cur[-int(max_chars * OVERLAP):]
                cut = tail.find(" ")
                cur = (tail[cut + 1:] if cut >= 0 else tail) + "\n\n" + part
            else:
                cur = (cur + "\n\n" + part) if cur else part
    if cur.strip():
        wins.append(cur)
    return wins


def chunk_document(text: str, doc_title: str, doc_slug: str) -> list[ChunkDraft]:
    drafts: list[ChunkDraft] = []
    for path, _level, body in split_sections(text, doc_title):
        heading = path.split(" > ")[-1]
        anchor = f"{doc_slug}--{slug(heading)}" if heading != doc_title else f"{doc_slug}--top"
        parent_idx = len(drafts)
        drafts.append(ChunkDraft(parent_idx, body, path, anchor, None, est_tokens(body),
                                 hashlib.sha256(body.encode()).hexdigest(), is_parent=True))
        for win in _windows(body):
            content = f"{path}\n{win}"
            drafts.append(ChunkDraft(len(drafts), content, path, anchor, parent_idx, est_tokens(content),
                                     hashlib.sha256(content.encode()).hexdigest()))
    return drafts

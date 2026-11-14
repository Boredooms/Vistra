"""Parse + normalize sources to a markdown-ish text with # headings."""
from __future__ import annotations

import re
import unicodedata

from bs4 import BeautifulSoup, Tag

from app.core.errors import validation_error

MAX_CHARS = 400_000


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def html_to_markdown(html: str) -> tuple[str, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "footer", "noscript", "iframe", "form"]):
        t.decompose()
    title = soup.title.get_text(strip=True) if soup.title else None
    root = soup.body or soup
    lines: list[str] = []

    def walk(node: Tag) -> None:
        for child in node.children:
            if not isinstance(child, Tag):
                continue
            name = child.name
            if name and re.fullmatch(r"h[1-6]", name):
                lines.append("\n" + "#" * int(name[1]) + " " + child.get_text(" ", strip=True) + "\n")
            elif name in ("p", "blockquote", "pre"):
                lines.append(child.get_text(" ", strip=True) + "\n")
            elif name == "li":
                lines.append("- " + child.get_text(" ", strip=True))
            elif name == "tr":
                cells = [c.get_text(" ", strip=True) for c in child.find_all(["th", "td"])]
                lines.append(" | ".join(cells))
            else:
                walk(child)

    walk(root)
    return "\n".join(lines), title


def parse_source(source_type: str, content: str) -> tuple[str, str | None]:
    """Return (normalized text, detected title)."""
    if len(content) > MAX_CHARS:
        raise validation_error(f"Source exceeds {MAX_CHARS} characters")
    if source_type == "html" or source_type == "url":
        text, title = html_to_markdown(content)
        return normalize(text), title
    if source_type in ("markdown", "text"):
        m = re.match(r"\s*#\s+(.+)", content)
        return normalize(content), (m.group(1).strip() if m else None)
    raise validation_error(f"Unsupported source type '{source_type}'")

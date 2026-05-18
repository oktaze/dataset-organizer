"""Caption assembly.

Order (per CLAUDE.md): trigger, costume_trigger?, costume_tags, prepend_tags,
then the remaining contextual auto tags, then append_tags. Character constant
tags are excluded so the LoRA learns them implicitly. Costume canonical tags
and user prepend/append tags are always kept (forced) even if they collide
with a constant — costume consistency / explicit intent wins.
"""

from __future__ import annotations

from typing import Optional


def build_caption(
    trigger: str,
    auto_tags: list[str],
    constant_tags: list[str],
    costume_tags: Optional[list[str]] = None,
    costume_trigger: Optional[str] = None,
    prepend_tags: Optional[list[str]] = None,
    append_tags: Optional[list[str]] = None,
) -> str:
    costume_tags = costume_tags or []
    prepend_tags = prepend_tags or []
    append_tags = append_tags or []
    constants = {t.strip() for t in constant_tags if t.strip()}

    parts: list[str] = []
    seen: set[str] = set()

    def add(tag: str, force: bool = False) -> None:
        t = tag.strip()
        if not t or t in seen:
            return
        if not force and t in constants:
            return
        seen.add(t)
        parts.append(t)

    if trigger.strip():
        add(trigger, force=True)
    if costume_trigger:
        add(costume_trigger, force=True)
    for t in costume_tags:
        add(t, force=True)
    # User-requested tags: forced (not filtered by constants), deduped by
    # `seen`. Prepend sits right after the canonical tags, append at the end.
    for t in prepend_tags:
        add(t, force=True)
    for t in auto_tags:
        add(t, force=False)
    for t in append_tags:
        add(t, force=True)

    return ", ".join(parts)

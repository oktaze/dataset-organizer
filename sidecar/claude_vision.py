"""Optional Claude Vision fallback for ambiguous costume matching.

Used only when a /costume/match request sets ``use_claude=true`` AND
``ANTHROPIC_API_KEY`` is configured. Sends a downscaled image plus the
candidate costume catalog to Claude and asks it to pick the best costume.

Defaults to ``claude-opus-4-7`` (override with the ``CLAUDE_VISION_MODEL``
env var, e.g. ``claude-haiku-4-5`` to reduce cost).
"""

from __future__ import annotations

import base64
import io
import json
import os

from typing import Optional

from PIL import Image

_DEFAULT_MODEL = "claude-opus-4-7"
# Costume classification doesn't need high-res — downscale to bound tokens.
_MAX_EDGE = 768


def usable(api_key: Optional[str]) -> bool:
    """True if a key is available — from the request or the env (cheap)."""
    return bool(api_key or os.environ.get("ANTHROPIC_API_KEY"))


def _make_client(api_key: Optional[str]):
    import anthropic  # lazy: optional dependency

    # Explicit key from the app's Settings wins; else the SDK reads
    # ANTHROPIC_API_KEY from the env / sidecar/.env.
    return anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()


def _encode_image(path: str) -> str:
    img = Image.open(path)
    if img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    scale = min(1.0, _MAX_EDGE / max(w, h))
    if scale < 1.0:
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))),
            Image.BICUBIC,
        )
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


def match(
    image_path: str,
    costumes: list[dict],
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> dict:
    """Return {best_costume_id, scores, method} — same shape as the WD matcher."""
    client = _make_client(api_key)
    resolved_model = (
        model or os.environ.get("CLAUDE_VISION_MODEL") or _DEFAULT_MODEL
    )
    image_b64 = _encode_image(image_path)

    catalog = "\n".join(
        f'- id="{c["id"]}" name="{c.get("name", "")}" '
        f'canonical_tags=[{", ".join(c.get("tags", []))}] '
        f'color_tags=[{", ".join(c.get("color_tags", []))}]'
        for c in costumes
    )

    # System prompt + costume catalog are stable across every image in an
    # import/reprocess run → cache the prefix. The image (volatile) goes in
    # the user message, after the cached prefix.
    system = [
        {
            "type": "text",
            "text": (
                "You classify an anime/illustration image into exactly one "
                "costume from a fixed catalog, for building a LoRA training "
                "dataset. Judge by the outfit and its signature colors — not "
                "the character's face, pose, or background. Pick the single "
                "best match. If no costume is a reasonable match, return null "
                "for best_costume_id.\n\n"
                f"Costume catalog:\n{catalog}"
            ),
            "cache_control": {"type": "ephemeral"},
        }
    ]

    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "best_costume_id": {
                "anyOf": [{"type": "string"}, {"type": "null"}]
            },
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
        "required": ["best_costume_id", "confidence", "reason"],
    }

    resp = client.messages.create(
        model=resolved_model,
        max_tokens=1024,
        system=system,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": "Which costume id best matches this image?",
                    },
                ],
            }
        ],
    )

    text = "".join(
        b.text for b in resp.content if getattr(b, "type", None) == "text"
    )
    parsed = json.loads(text)

    valid = {c["id"] for c in costumes}
    best = parsed.get("best_costume_id")
    if best not in valid:
        best = None
    try:
        conf = max(0.0, min(1.0, float(parsed.get("confidence") or 0.0)))
    except (TypeError, ValueError):
        conf = 0.0

    scores = {c["id"]: (conf if c["id"] == best else 0.0) for c in costumes}
    return {
        "best_costume_id": best,
        "scores": scores,
        "method": "claude_vision",
    }

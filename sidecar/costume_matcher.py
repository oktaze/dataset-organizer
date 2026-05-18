"""Costume matching: score each costume against the tags WD Tagger
detects in an image, pick the best.

Color tags are weighted higher than generic canonical tags — a costume's
signature colors are strong discriminators between otherwise similar
outfits (e.g. two school uniforms differing only by ribbon color).
"""

from __future__ import annotations

from typing import Optional

import tagger

_CANONICAL_WEIGHT = 1.0
_COLOR_WEIGHT = 1.5


def _score(
    detected: set[str], canonical: list[str], color: list[str]
) -> float:
    total = 0.0
    got = 0.0
    for t in canonical:
        total += _CANONICAL_WEIGHT
        if t in detected:
            got += _CANONICAL_WEIGHT
    for t in color:
        total += _COLOR_WEIGHT
        if t in detected:
            got += _COLOR_WEIGHT
    return got / total if total > 0 else 0.0


def match(
    image_path: str,
    costumes: list[dict],
    threshold: Optional[float] = None,
) -> dict:
    tags = tagger.tag_image(image_path, threshold)
    detected = {item["tag"] for item in tags}

    scores: dict[str, float] = {}
    for c in costumes:
        scores[c["id"]] = round(
            _score(detected, c.get("tags", []), c.get("color_tags", [])), 4
        )

    best = max(scores, key=lambda k: scores[k]) if scores else None
    return {
        "best_costume_id": best,
        "scores": scores,
        "method": "wd_tagger",
    }

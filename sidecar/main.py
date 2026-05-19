"""LoRA Organizer — Python sidecar (FastAPI).

Routes match the API contract in CLAUDE.md: ``/health``, ``/tag``,
``/tag/batch``, ``/costume/match`` and ``/caption/build``.
"""

from __future__ import annotations

from typing import Optional

# Load sidecar/.env (WD_* tuning) if present.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

import caption
import costume_matcher
import tagger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="LoRA Organizer Sidecar", version="0.3.0")

# The Tauri webview (http://localhost:1420 in dev, tauri://localhost in prod)
# is a different origin than this 127.0.0.1 sidecar. Allow all origins —
# the server only ever binds to loopback.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class TagItem(BaseModel):
    tag: str
    score: float


class TagRequest(BaseModel):
    image_path: str
    threshold: Optional[float] = None
    max_tags: Optional[int] = None
    blacklist: Optional[list[str]] = None


class TagResponse(BaseModel):
    tags: list[TagItem]


class TagBatchRequest(BaseModel):
    image_paths: list[str]
    threshold: Optional[float] = None
    max_tags: Optional[int] = None
    blacklist: Optional[list[str]] = None


class TagBatchResultItem(BaseModel):
    path: str
    tags: list[TagItem]


class TagBatchResponse(BaseModel):
    results: list[TagBatchResultItem]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    # Must never touch the model — just reads a module flag.
    return HealthResponse(status="ok", model_loaded=tagger.is_loaded())


@app.post("/tag", response_model=TagResponse)
def tag(req: TagRequest) -> TagResponse:
    tags = tagger.tag_image(req.image_path, req.threshold, req.max_tags, req.blacklist)
    return TagResponse(tags=tags)


@app.post("/tag/batch", response_model=TagBatchResponse)
def tag_batch(req: TagBatchRequest) -> TagBatchResponse:
    results = [
        TagBatchResultItem(
            path=p,
            tags=tagger.tag_image(p, req.threshold, req.max_tags, req.blacklist),
        )
        for p in req.image_paths
    ]
    return TagBatchResponse(results=results)


class CostumeIn(BaseModel):
    id: str
    name: Optional[str] = None
    tags: list[str] = []
    color_tags: list[str] = []


class CostumeMatchRequest(BaseModel):
    image_path: str
    costumes: list[CostumeIn]
    threshold: Optional[float] = None


class CostumeMatchResponse(BaseModel):
    best_costume_id: Optional[str]
    scores: dict[str, float]
    method: str


class CaptionBuildRequest(BaseModel):
    trigger: str
    auto_tags: list[str]
    constant_tags: list[str] = []
    costume_tags: Optional[list[str]] = None
    costume_trigger: Optional[str] = None
    prepend_tags: Optional[list[str]] = None
    append_tags: Optional[list[str]] = None


class CaptionBuildResponse(BaseModel):
    caption: str


@app.post("/costume/match", response_model=CostumeMatchResponse)
def costume_match(req: CostumeMatchRequest) -> CostumeMatchResponse:
    costumes = [c.model_dump() for c in req.costumes]
    result = costume_matcher.match(req.image_path, costumes, req.threshold)
    return CostumeMatchResponse(**result)


@app.post("/caption/build", response_model=CaptionBuildResponse)
def caption_build(req: CaptionBuildRequest) -> CaptionBuildResponse:
    text = caption.build_caption(
        trigger=req.trigger,
        auto_tags=req.auto_tags,
        constant_tags=req.constant_tags,
        costume_tags=req.costume_tags,
        costume_trigger=req.costume_trigger,
        prepend_tags=req.prepend_tags,
        append_tags=req.append_tags,
    )
    return CaptionBuildResponse(caption=text)


class ModelStatus(BaseModel):
    state: str  # idle | downloading | done | error
    downloaded: int
    total: int
    downloaded_ok: bool
    model_loaded: bool
    error: Optional[str] = None


@app.get("/model/status", response_model=ModelStatus)
def model_status() -> ModelStatus:
    return ModelStatus(**tagger.download_status())


@app.post("/model/download", response_model=ModelStatus)
def model_download() -> ModelStatus:
    tagger.start_download()
    return ModelStatus(**tagger.download_status())

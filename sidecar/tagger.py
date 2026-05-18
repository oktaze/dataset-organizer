"""WD Tagger v3 (ONNX) inference.

The model + tag list are downloaded lazily from the Hugging Face Hub on the
first tagging request (cached under HF_HOME, set by the Rust spawner to
``sidecar/models``). ``/health`` never triggers loading, so the sidecar
answers instantly even before the ~400 MB model exists on disk.
"""

from __future__ import annotations

import csv
import os
import threading
from typing import Optional

import numpy as np
import onnxruntime as ort
from huggingface_hub import get_hf_file_metadata, hf_hub_download, hf_hub_url
from PIL import Image

WD_REPO = "SmilingWolf/" + os.environ.get("WD_MODEL", "wd-vit-tagger-v3")
WD_THRESHOLD = float(os.environ.get("WD_THRESHOLD", "0.35"))

_FILES = ("model.onnx", "selected_tags.csv")

_session: Optional[ort.InferenceSession] = None
_tag_names: list[str] = []
_input_size = 448

# Download progress state (model files are fetched explicitly from the UI,
# or lazily on the first /tag).
_dl_lock = threading.Lock()
_dl_state = {"state": "idle", "downloaded": 0, "total": 0, "error": None}


def is_loaded() -> bool:
    """Whether the ONNX session is ready (cheap — no IO)."""
    return _session is not None


def _hf_home() -> str:
    return os.environ.get(
        "HF_HOME", os.path.expanduser("~/.cache/huggingface")
    )


def is_downloaded() -> bool:
    """True if all model files are already in the local HF cache."""
    try:
        for f in _FILES:
            hf_hub_download(WD_REPO, f, local_files_only=True)
        return True
    except Exception:
        return False


def _cache_bytes() -> int:
    """Bytes on disk for this repo (incl. in-progress `.incomplete`)."""
    blobs = os.path.join(
        _hf_home(),
        "hub",
        "models--" + WD_REPO.replace("/", "--"),
        "blobs",
    )
    total = 0
    if os.path.isdir(blobs):
        for name in os.listdir(blobs):
            try:
                total += os.path.getsize(os.path.join(blobs, name))
            except OSError:
                pass
    return total


def _download_worker() -> None:
    try:
        try:
            meta = get_hf_file_metadata(hf_hub_url(WD_REPO, "model.onnx"))
            total = int(meta.size or 0)
        except Exception:
            total = 0
        with _dl_lock:
            _dl_state.update(
                state="downloading",
                total=total,
                downloaded=_cache_bytes(),
                error=None,
            )
        for f in _FILES:
            hf_hub_download(WD_REPO, f)
        with _dl_lock:
            _dl_state.update(
                state="done",
                downloaded=_dl_state["total"] or _cache_bytes(),
                error=None,
            )
    except Exception as e:  # network, disk, etc.
        with _dl_lock:
            _dl_state.update(state="error", error=str(e))


def start_download() -> None:
    """Start the model download in a background thread (idempotent)."""
    with _dl_lock:
        if _dl_state["state"] == "downloading":
            return
        _dl_state.update(
            state="downloading", downloaded=_cache_bytes(), error=None
        )
    threading.Thread(target=_download_worker, daemon=True).start()


def download_status() -> dict:
    with _dl_lock:
        st = dict(_dl_state)
    if st["state"] == "downloading":
        st["downloaded"] = _cache_bytes()
    st["downloaded_ok"] = is_downloaded()
    st["model_loaded"] = is_loaded()
    return st


def _ensure_loaded() -> None:
    global _session, _tag_names, _input_size
    if _session is not None:
        return

    model_path = hf_hub_download(WD_REPO, "model.onnx")
    tags_path = hf_hub_download(WD_REPO, "selected_tags.csv")

    session = ort.InferenceSession(
        model_path, providers=["CPUExecutionProvider"]
    )
    # WD v3 input is NHWC: [batch, size, size, 3]. Fall back to 448 if dynamic.
    shape = session.get_inputs()[0].shape
    if len(shape) == 4 and isinstance(shape[1], int):
        _input_size = shape[1]

    with open(tags_path, newline="", encoding="utf-8") as f:
        _tag_names = [row["name"] for row in csv.DictReader(f)]

    _session = session


def _preprocess(path: str) -> np.ndarray:
    """RGB -> square (white pad) -> resize -> BGR -> float32 0-255, NHWC."""
    img = Image.open(path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    canvas = Image.new("RGBA", img.size, (255, 255, 255))
    canvas.alpha_composite(img)
    img = canvas.convert("RGB")

    w, h = img.size
    side = max(w, h)
    square = Image.new("RGB", (side, side), (255, 255, 255))
    square.paste(img, ((side - w) // 2, (side - h) // 2))
    square = square.resize((_input_size, _input_size), Image.BICUBIC)

    arr = np.asarray(square, dtype=np.float32)
    arr = arr[:, :, ::-1]  # RGB -> BGR
    return np.expand_dims(arr, axis=0)


def tag_image(path: str, threshold: Optional[float] = None) -> list[dict]:
    _ensure_loaded()
    assert _session is not None
    th = WD_THRESHOLD if threshold is None else threshold

    x = _preprocess(path)
    input_name = _session.get_inputs()[0].name
    probs = _session.run(None, {input_name: x})[0][0]

    return [
        {"tag": _tag_names[i], "score": float(p)}
        for i, p in enumerate(probs)
        if i < len(_tag_names) and p >= th
    ]

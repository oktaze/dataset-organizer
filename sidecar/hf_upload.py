"""Push a prepared dataset folder to a Hugging Face dataset repo.

Mirrors the download state-machine in ``tagger.py``: the upload runs in a
background thread, the UI polls ``upload_status()``. ``huggingface_hub`` is
already a dependency (WD Tagger model download), so no new requirement.

The token is passed per request, kept only in the worker thread's args and a
transient ``HfApi`` instance — never persisted, logged, or returned by the
status endpoint.
"""

from __future__ import annotations

import os
import threading

from huggingface_hub import HfApi

# Upload progress state. ``phase`` is human-readable; ``total``/``done`` are
# file counts (huggingface_hub gives no per-byte callback for upload_folder,
# so progress is phase-based — the UI shows an indeterminate bar).
_up_lock = threading.Lock()
_up_state: dict = {
    "state": "idle",  # idle | uploading | done | error
    "phase": "",
    "done": 0,
    "total": 0,
    "repo_url": None,
    "error": None,
}


def whoami(token: str) -> str:
    """Return the HF username for ``token``. Raises on an invalid token."""
    return HfApi(token=token).whoami()["name"]


def _count_files(folder: str) -> int:
    n = 0
    for _root, _dirs, files in os.walk(folder):
        n += len(files)
    return n


def _worker(folder: str, repo_id: str, token: str, private: bool) -> None:
    try:
        api = HfApi(token=token)

        with _up_lock:
            _up_state.update(
                state="uploading",
                phase="creating repo",
                done=0,
                total=0,
                repo_url=None,
                error=None,
            )
        api.create_repo(
            repo_id, repo_type="dataset", exist_ok=True, private=private
        )

        total = _count_files(folder)
        with _up_lock:
            _up_state.update(phase="uploading files", total=total)
        api.upload_folder(
            folder_path=folder, repo_id=repo_id, repo_type="dataset"
        )

        with _up_lock:
            _up_state.update(
                state="done",
                phase="done",
                done=_up_state["total"],
                repo_url=f"https://huggingface.co/datasets/{repo_id}",
            )
    except Exception as e:  # network, auth, disk, etc.
        with _up_lock:
            _up_state.update(state="error", error=str(e))


def start_upload(
    folder: str, repo_id: str, token: str, private: bool
) -> None:
    """Start the upload in a background thread (no-op if already running)."""
    with _up_lock:
        if _up_state["state"] == "uploading":
            return
        _up_state.update(
            state="uploading",
            phase="preparing",
            done=0,
            total=0,
            repo_url=None,
            error=None,
        )
    threading.Thread(
        target=_worker,
        args=(folder, repo_id, token, private),
        daemon=True,
    ).start()


def upload_status() -> dict:
    with _up_lock:
        return dict(_up_state)

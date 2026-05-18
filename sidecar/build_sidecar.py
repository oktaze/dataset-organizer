"""Freeze the FastAPI sidecar into a self-contained binary for the
packaged Tauri app.

Run from the repo root (or anywhere) with the sidecar venv's python:

    sidecar/.venv/bin/python sidecar/build_sidecar.py

Output: src-tauri/sidecar-bin/lora-sidecar  (single --onefile ELF)
which `pnpm tauri build` ships as a bundle resource. --onefile (not
--onedir) is required so linuxdeploy doesn't choke on PyInstaller's
loose hash-named .so files when building the AppImage. The ~360 MB WD
model is NOT bundled — it downloads lazily on first /tag into the app
data dir.
"""

import os
import shutil
import sys

import PyInstaller.__main__

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
DIST = os.path.join(PROJECT, "src-tauri", "sidecar-bin")
WORK = os.path.join(HERE, "build")

# A clean dist avoids stale _internal libs across rebuilds.
shutil.rmtree(DIST, ignore_errors=True)

PyInstaller.__main__.run(
    [
        "--noconfirm",
        "--clean",
        "--name",
        "lora-sidecar",
        # --onefile (single ELF): the embedded libs are NOT loose .so files
        # in the AppDir, so linuxdeploy can't choke on PyInstaller's
        # hash-named/$ORIGIN libs when building the AppImage.
        "--onefile",
        "--distpath",
        DIST,
        "--workpath",
        WORK,
        "--specpath",
        HERE,
        "--collect-all",
        "onnxruntime",
        "--collect-all",
        "huggingface_hub",
        "--collect-all",
        "anthropic",
        "--collect-submodules",
        "uvicorn",
        "--collect-data",
        "certifi",
        "--hidden-import",
        "dotenv",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.loops.auto",
        os.path.join(HERE, "run.py"),
    ]
)

exe = os.path.join(
    DIST, "lora-sidecar.exe" if os.name == "nt" else "lora-sidecar"
)
if not os.path.isfile(exe):
    print(f"ERROR: expected binary not found at {exe}", file=sys.stderr)
    sys.exit(1)
print(f"OK: {exe}")

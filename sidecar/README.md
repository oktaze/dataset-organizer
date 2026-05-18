# LoRA Organizer — Python sidecar

FastAPI service spawned automatically by the Tauri app. Endpoints:
`GET /health`, `POST /tag`, `POST /tag/batch` (see CLAUDE.md for the full contract).

## Setup

```bash
# From the repo root. Use Python 3.12 — see the version note below.
/usr/bin/python3.12 -m venv sidecar/.venv
sidecar/.venv/bin/pip install -r sidecar/requirements.txt

# Optional: pre-download the WD Tagger v3 model (~400 MB) so the
# first /tag call isn't a long download.
HF_HOME=sidecar/models sidecar/.venv/bin/python sidecar/download_models.py
```

The Tauri app spawns `sidecar/.venv/bin/python -m uvicorn main:app` on a
random free port and sets `HF_HOME=sidecar/models`.

## Standalone debug

```bash
cd sidecar && .venv/bin/python -m uvicorn main:app --port 7842
curl 127.0.0.1:7842/health      # -> {"status":"ok","model_loaded":false}
```

## Production build (packaging)

`pnpm tauri dev` runs the venv interpreter. The packaged app
(`pnpm tauri build`) instead ships a **frozen PyInstaller binary** as a
Tauri bundle resource and spawns that — no Python/venv needed on the
end user's machine.

```bash
# One-time: build-only deps in the venv (pyinstaller + patchelf wheel)
sidecar/.venv/bin/pip install -r sidecar/requirements-build.txt

# Produce the binary -> src-tauri/sidecar-bin/lora-sidecar
# (single --onefile ELF, ~66 MB)
pnpm build:sidecar

# Full app bundle -> deb + rpm + AppImage. `beforeBuildCommand`
# chains `pnpm build:sidecar`, so this rebuilds the sidecar too.
pnpm tauri build
```

Notes:
- **`pnpm tauri` is wrapped** (`scripts/tauri.mjs`): it sets
  `APPIMAGE_EXTRACT_AND_RUN=1` (so the AppImage bundler's `linuxdeploy`
  runs without FUSE/libfuse2, absent on Ubuntu 24.04 / Mint 22) and puts
  the venv bin on `PATH` (so `linuxdeploy` finds `patchelf`, shipped via
  the `patchelf` PyPI wheel — no `sudo apt install` needed). `dev`/`build`
  still work unchanged.
- **`--onefile`, not `--onedir`**: a single ELF whose only dynamic deps
  are system libs. `--onedir` ships loose hash-named `.so` files (Pillow
  webp, numpy…) resolved via `$ORIGIN`, which `linuxdeploy` cannot follow
  → AppImage build fails. Trade-off: onefile self-extracts to a temp dir
  on launch (~1–2 s slower first start); acceptable for a desktop app.
- **Switching onedir↔onefile**: Tauri stages resources at
  `target/<profile>/sidecar-bin/`. A stale onedir *directory* there
  collides with the new onefile *file* (`EISDIR`). If you see that, run
  `rm -rf src-tauri/target/{debug,release}/sidecar-bin
  src-tauri/target/release/bundle` once.
- **Per-OS**: PyInstaller only builds for the host OS. Build on each
  target platform. Windows venv python is
  `sidecar/.venv/Scripts/python.exe` — adjust `build:sidecar` and note
  the resource would be `lora-sidecar.exe`.
- **WD model is NOT bundled** (~70 MB installers, not ~430 MB). In the
  packaged app it lazily downloads (~360 MB) into the OS app-data dir
  (`~/.local/share/com.adriendoy.lora-organizer/models` on Linux) — the
  first-launch prompt / Settings button trigger it. In dev it uses
  `sidecar/models`.
- The Rust spawner picks dev vs frozen automatically via
  `cfg!(debug_assertions)` and resolves the binary from the Tauri
  resource dir.

## Python version note (important)

The default system `python3` here is 3.14, for which `onnxruntime` has no
wheels yet. The venv **must** be created with an interpreter that has
`onnxruntime` wheels. Fallback chain:

1. **Preferred:** `/usr/bin/python3.12` (cp312 wheels exist — used above).
2. If only 3.13 is available: try `python3.13`; if `onnxruntime` fails to
   install, pin it to a version that ships cp313 wheels.
3. **Last resort:** install everything except `onnxruntime`. The model is
   loaded lazily, so `/health` still returns
   `{"status":"ok","model_loaded":false}` and the app boots — only the
   `/tag` endpoints are unavailable until `onnxruntime` can be installed.

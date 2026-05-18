# LoRa Organizer

A desktop app for building and curating image datasets used to train
**LoRAs** for Stable Diffusion / Illustrious XL. It auto-tags images with
a local WD Tagger v3 model, assembles training captions following
consistent rules, and exports a clean dataset — with a dedicated workflow
for **character** LoRAs built around reusable *costumes*.

> Tauri v2 + React + a bundled Python sidecar. Runs fully offline; Claude
> Vision is an optional, paid extra.

---

## What it does

Three project types:

- **Character** — the core workflow. You define *costumes* (sets of
  canonical tags) and *constant tags* (traits the LoRA should learn
  implicitly, e.g. `silver_hair`). On import, each image is auto-tagged,
  matched to the most likely costume, and a caption is assembled as
  `trigger, costume tags, contextual tags…` while excluding the constant
  tags so the model learns them without captioning.
- **Style** — simplified flow, no costumes.
- **Concept** — simplified flow, no costumes.

Key features:

- **Local auto-tagging** with WD Tagger v3 (ONNX, runs on your machine).
- **Costume builder** and automatic costume matching per image.
- **Caption builder** with a fixed tag order and constant-tag exclusion.
- **Gallery** with a virtualized grid, per-image tag editor, keyboard
  shortcuts, and batch review.
- **Dataset export** as a flat folder of `image` + `image.txt`, or a zip.
- **Optional Claude Vision** fallback for ambiguous costume matching
  (requires an Anthropic API key; off by default).
- **Built-in auto-update** (VS Code-style): checks on startup, downloads
  silently, prompts to restart. Manual check in Settings.

Your data stays local: a SQLite DB and settings live in the OS app-data
dir; the WD model (~360 MB) downloads on first use into that same dir and
is **not** bundled. Any Anthropic API key is stored locally and only sent
to the local sidecar over loopback when Claude Vision is enabled.

---

## Tech stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript, Tailwind v4, shadcn/ui |
| State / data | Zustand, TanStack Query, TanStack Virtual |
| Local DB | SQLite via `rusqlite` |
| Sidecar | Python FastAPI (frozen with PyInstaller for release) |
| Auto-tagger | WD Tagger v3 (ONNX Runtime) |
| Vision LLM | Claude (Anthropic API) — optional |
| Updates | `tauri-plugin-updater` + GitHub Releases |

```
src/          React frontend (components, hooks, stores, lib)
src-tauri/    Rust: Tauri commands (filesystem, db, sidecar), config
sidecar/      Python FastAPI service (WD Tagger, costume matcher, caption)
scripts/      tauri.mjs / build-sidecar.mjs build wrappers
.github/      release.yml — tagged-release CI
```

See `CLAUDE.md` for the full architecture, data model, and API contract,
and `sidecar/README.md` for sidecar internals.

---

## Development

### Prerequisites

- **Node** + **pnpm**
- **Rust** stable toolchain
- **Python 3.12** — required for the sidecar (`onnxruntime` ships cp312
  wheels; newer Python may have none). See `sidecar/README.md` for the
  fallback chain.
- **Linux only** — Tauri system deps:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev build-essential \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev patchelf
  ```

### Setup & run

```bash
pnpm install

# Create the sidecar venv (use Python 3.12)
python3.12 -m venv sidecar/.venv
sidecar/.venv/bin/pip install -r sidecar/requirements.txt

# Run the whole app (frontend + Rust + auto-started sidecar)
pnpm tauri dev
```

The WD Tagger model isn't downloaded automatically — trigger it from the
first-launch prompt or **Settings**, or pre-fetch:
`HF_HOME=sidecar/models sidecar/.venv/bin/python sidecar/download_models.py`.

### Production build

```bash
# One-time: build-only deps (PyInstaller; patchelf is Linux-only)
sidecar/.venv/bin/pip install -r sidecar/requirements-build.txt

pnpm tauri build
```

`pnpm tauri` is wrapped (`scripts/tauri.mjs`): it sets
`APPIMAGE_EXTRACT_AND_RUN=1`, puts the venv on `PATH`, and auto-loads the
updater signing key from `~/.tauri/lora-organizer-updater.key` so signed
bundles build without exporting env vars. PyInstaller does not
cross-compile — build on each target OS.

---

## Releasing & auto-update

Releases are produced by `.github/workflows/release.yml` on a version tag.
The first updater-enabled release must be **installed manually**;
auto-update then works for every release after it.

1. Bump `version` in `src-tauri/tauri.conf.json`, `package.json`, and
   `src-tauri/Cargo.toml` (keep them in sync).
2. Commit, then:
   ```bash
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. CI builds Linux / Windows / macOS (Apple Silicon + Intel), signs the
   updater artifacts (`TAURI_SIGNING_PRIVATE_KEY` repo secret), and
   publishes a GitHub Release with `latest.json`. Installed apps pick up
   the update on next launch.

Notes:
- The updater compares the running version to `latest.json`; **always
  bump `version`** for a new release.
- On Linux, only the **AppImage** auto-updates (the `.deb` is for manual
  install).
- macOS builds are unsigned: on first manual install, right-click → Open.

---

## License

No license declared yet.

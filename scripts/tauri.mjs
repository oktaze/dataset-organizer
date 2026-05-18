// Wrapper around the Tauri CLI. Sets APPIMAGE_EXTRACT_AND_RUN=1 so the
// AppImage bundler's `linuxdeploy` (itself an AppImage) self-extracts
// instead of requiring FUSE/libfuse2 — which Ubuntu 24.04 / Mint 22 don't
// ship by default. Harmless on macOS/Windows. All args are forwarded, so
// `pnpm tauri dev` / `pnpm tauri build` keep working unchanged.

import { spawnSync } from "node:child_process";
import path from "node:path";

const isWin = process.platform === "win32";
const bin = path.join(
  "node_modules",
  ".bin",
  isWin ? "tauri.cmd" : "tauri",
);

// Put the sidecar venv's bin on PATH so the Linux AppImage bundler's
// linuxdeploy finds `patchelf` (shipped via the patchelf PyPI wheel —
// no `sudo apt install patchelf` needed).
const venvBin = path.resolve(
  "sidecar",
  ".venv",
  isWin ? "Scripts" : "bin",
);
const pathSep = isWin ? ";" : ":";

const { status } = spawnSync(bin, process.argv.slice(2), {
  stdio: "inherit",
  shell: isWin,
  env: {
    ...process.env,
    APPIMAGE_EXTRACT_AND_RUN: "1",
    PATH: `${venvBin}${pathSep}${process.env.PATH ?? ""}`,
  },
});

process.exit(status ?? 1);

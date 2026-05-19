// Wrapper around the Tauri CLI. Sets APPIMAGE_EXTRACT_AND_RUN=1 so the
// AppImage bundler's `linuxdeploy` (itself an AppImage) self-extracts
// instead of requiring FUSE/libfuse2 — which Ubuntu 24.04 / Mint 22 don't
// ship by default. Harmless on macOS/Windows. All args are forwarded, so
// `pnpm tauri dev` / `pnpm tauri build` keep working unchanged.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const isWin = process.platform === "win32";

// Auto-load the updater signing key for local release builds so
// `pnpm tauri build` doesn't fail at the signing step ("A public key has
// been found, but no private key"). `createUpdaterArtifacts` is enabled,
// so every bundle must be signed. Only fills the var if it isn't already
// set (CI sets it from secrets and doesn't use this wrapper anyway) and
// the conventional key file exists. Override the path with
// TAURI_SIGNING_KEY_FILE. The key was generated with an empty password.
const keyFile =
  process.env.TAURI_SIGNING_KEY_FILE ||
  path.join(os.homedir(), ".tauri", "dataset-organizer-updater.key");
const signingEnv = {};
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && existsSync(keyFile)) {
  signingEnv.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyFile, "utf8");
  signingEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "";
}

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
    ...signingEnv,
    APPIMAGE_EXTRACT_AND_RUN: "1",
    PATH: `${venvBin}${pathSep}${process.env.PATH ?? ""}`,
  },
});

process.exit(status ?? 1);

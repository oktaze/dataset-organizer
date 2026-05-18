// Freeze the Python sidecar via its venv interpreter, OS-aware.
//
// The venv layout differs by platform: POSIX uses `.venv/bin/python`,
// Windows uses `.venv\Scripts\python.exe`. The old hard-coded
// `sidecar/.venv/bin/python` broke `pnpm build:sidecar` on Windows CI
// runners. `sidecar/build_sidecar.py` resolves its own paths from
// __file__, so the working directory here doesn't matter.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const isWin = process.platform === "win32";
const python = path.resolve(
  "sidecar",
  ".venv",
  isWin ? "Scripts" : "bin",
  isWin ? "python.exe" : "python",
);

if (!existsSync(python)) {
  console.error(
    `[build-sidecar] venv interpreter not found at ${python}\n` +
      `Create it first:\n` +
      `  python -m venv sidecar/.venv\n` +
      `  ${python} -m pip install -r sidecar/requirements.txt -r sidecar/requirements-build.txt`,
  );
  process.exit(1);
}

const { status } = spawnSync(
  python,
  [path.resolve("sidecar", "build_sidecar.py")],
  { stdio: "inherit", shell: false },
);

process.exit(status ?? 1);

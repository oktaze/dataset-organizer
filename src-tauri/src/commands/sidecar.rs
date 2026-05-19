//! Python FastAPI sidecar process management.
//!
//! Dev (`pnpm tauri dev`, debug build): spawn the venv interpreter
//! `python -m uvicorn main:app`. Packaged (`pnpm tauri build`, release):
//! spawn the frozen PyInstaller binary shipped as a bundle resource.
//! `spawn_internal` is the single idempotent source of truth — called
//! from the Tauri `setup()` hook and the `start_sidecar` command.

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct SidecarState {
    pub child: Mutex<Option<Child>>,
    pub port: Mutex<Option<u16>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
        }
    }
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

/// `<project>/sidecar` — in dev, `src-tauri/` (CARGO_MANIFEST_DIR) sits next to it.
fn sidecar_dir() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .map(|p| p.join("sidecar"))
        .unwrap_or_else(|| PathBuf::from("sidecar"))
}

fn venv_python(dir: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        dir.join(".venv").join("bin").join("python")
    }
}

fn is_alive(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn frozen_exe_name() -> &'static str {
    if cfg!(windows) {
        "lora-sidecar.exe"
    } else {
        "lora-sidecar"
    }
}

/// Windows: stop the child console app from popping its own console window.
/// No-op elsewhere (the flag only exists on Windows).
#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut Command) {}

/// Locate the PyInstaller binary shipped as a bundle resource. Tauri's
/// resource layout has varied across versions, so try the likely paths.
fn frozen_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let res = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    let exe = frozen_exe_name();
    let candidates = [
        // --onefile layout (current): a single binary under sidecar-bin/.
        res.join("sidecar-bin").join(exe),
        res.join(exe),
        // legacy --onedir fallback.
        res.join("sidecar-bin").join("lora-sidecar").join(exe),
        res.join("lora-sidecar").join(exe),
    ];
    candidates
        .iter()
        .find(|p| p.is_file())
        .cloned()
        .ok_or_else(|| {
            format!(
                "bundled sidecar not found under {} — run `pnpm build:sidecar` before `pnpm tauri build`",
                res.display()
            )
        })
}

/// Build the spawn command for the current build profile.
/// Returns (Command, hf_home) — hf_home is created if missing.
fn build_command(app: &AppHandle, port: u16) -> Result<Command, String> {
    let port_s = port.to_string();

    if cfg!(debug_assertions) {
        // Dev: venv interpreter + uvicorn, model cache in sidecar/models.
        let dir = sidecar_dir();
        let py = venv_python(&dir);
        if !py.exists() {
            return Err(format!(
                "sidecar venv python not found at {} — run: python3.12 -m venv {}/.venv && {}/.venv/bin/pip install -r requirements.txt",
                py.display(),
                dir.display(),
                dir.display()
            ));
        }
        let mut cmd = Command::new(&py);
        cmd.args([
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            &port_s,
        ])
        .current_dir(&dir)
        .env("HF_HOME", dir.join("models"));
        Ok(cmd)
    } else {
        // Packaged: frozen binary, model cache in the writable app data dir
        // (the bundle is read-only).
        let exe = frozen_binary(app)?;
        let hf_home = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir: {e}"))?
            .join("models");
        std::fs::create_dir_all(&hf_home)
            .map_err(|e| format!("create {}: {e}", hf_home.display()))?;
        let cwd = exe
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let mut cmd = Command::new(&exe);
        cmd.args(["--host", "127.0.0.1", "--port", &port_s])
            .current_dir(&cwd)
            .env("HF_HOME", &hf_home);
        // No flashing console window on Windows for the frozen sidecar.
        hide_console(&mut cmd);
        Ok(cmd)
    }
}

pub fn spawn_internal(app: &AppHandle, state: &SidecarState) -> Result<u16, String> {
    // Idempotent: if a live child exists, return its port.
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            if is_alive(child) {
                if let Some(p) = *state.port.lock().map_err(|e| e.to_string())? {
                    return Ok(p);
                }
            } else {
                *guard = None;
            }
        }
    }

    let port = free_port()?;
    let mut cmd = build_command(app, port)?;
    let child = cmd
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {e}"))?;

    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    *state.port.lock().map_err(|e| e.to_string())? = Some(port);
    Ok(port)
}

pub fn kill_internal(state: &SidecarState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut p) = state.port.lock() {
        *p = None;
    }
}

#[tauri::command]
pub fn start_sidecar(app: AppHandle, state: State<SidecarState>) -> Result<u16, String> {
    spawn_internal(&app, &state)
}

#[tauri::command]
pub fn stop_sidecar(state: State<SidecarState>) -> Result<(), String> {
    kill_internal(&state);
    Ok(())
}

#[tauri::command]
pub fn get_sidecar_port(state: State<SidecarState>) -> Option<u16> {
    state.port.lock().ok().and_then(|p| *p)
}

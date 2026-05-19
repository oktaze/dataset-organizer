mod commands;

use commands::db::DbState;
use commands::sidecar::SidecarState;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(SidecarState::new())
        .setup(|app| {
            // SQLite: open + migrate, keep the connection in managed state.
            let conn = commands::db::init(app.handle())
                .map_err(|e| format!("db init failed: {e}"))?;
            app.manage(DbState(Arc::new(Mutex::new(conn))));

            // Auto-start the Python sidecar (non-fatal: the UI still boots
            // and reports the error via the status bar).
            let handle = app.handle().clone();
            let state = app.state::<SidecarState>();
            match commands::sidecar::spawn_internal(&handle, &state) {
                Ok(port) => {
                    let _ = handle.emit("sidecar://ready", port);
                }
                Err(e) => {
                    eprintln!("[sidecar] {e}");
                    let _ = handle.emit("sidecar://error", e);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<SidecarState>() {
                    commands::sidecar::kill_internal(&state);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::read_images_from_dir,
            commands::filesystem::read_images_meta,
            commands::filesystem::write_caption_file,
            commands::filesystem::get_image_thumbnail,
            commands::filesystem::export_dataset,
            commands::filesystem::export_dataset_zip,
            commands::filesystem::hf_export_tmpdir,
            commands::filesystem::remove_dir,
            commands::db::db_query,
            commands::db::db_execute,
            commands::sidecar::start_sidecar,
            commands::sidecar::stop_sidecar,
            commands::sidecar::get_sidecar_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

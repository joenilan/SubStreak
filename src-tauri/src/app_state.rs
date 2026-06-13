// Plain (non-secret) persistence for SubStreak streak state + config.
// Stored as JSON in the app data dir so progress survives restarts and reinstalls.

use std::path::PathBuf;

use tauri::Manager;

const STATE_FILENAME: &str = "substreak-state.json";

fn state_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(STATE_FILENAME))
        .map_err(|error| format!("failed to resolve app data dir: {error}"))
}

#[tauri::command]
pub fn load_substreak_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("failed to read SubStreak state: {error}"))
}

#[tauri::command]
pub fn save_substreak_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    value: String,
) -> Result<(), String> {
    let path = state_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create SubStreak state dir: {error}"))?;
    }
    let temp_path = path.with_extension("json.tmp");
    std::fs::write(&temp_path, value)
        .map_err(|error| format!("failed to write SubStreak state: {error}"))?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|error| format!("failed to replace SubStreak state: {error}"))?;
    }
    std::fs::rename(&temp_path, &path)
        .map_err(|error| format!("failed to finalize SubStreak state: {error}"))
}

#[tauri::command]
pub fn clear_substreak_state<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(());
    }
    std::fs::remove_file(&path).map_err(|error| format!("failed to clear SubStreak state: {error}"))
}

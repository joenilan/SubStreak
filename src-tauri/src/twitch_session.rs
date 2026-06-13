// Secure storage for the Twitch session snapshot.
//   - Windows: encrypt with DPAPI (CryptProtectData) into a file in app_data_dir.
//   - Other OSes: store via the OS keyring.
// Ported from the parent subathon_timer desktop app.

use std::path::PathBuf;

use serde_json::Value;
use tauri::Manager;

const SESSION_FILENAME: &str = "twitch-session.dat";

#[cfg(not(target_os = "windows"))]
const SESSION_SERVICE: &str = "substreak";
#[cfg(not(target_os = "windows"))]
const SESSION_ACCOUNT: &str = "twitch-session";

fn session_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SESSION_FILENAME))
        .map_err(|error| format!("failed to resolve app data dir: {error}"))
}

// ── Windows: DPAPI ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn protect_payload(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Error;
    use std::ptr::null_mut;
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let result = unsafe {
        CryptProtectData(
            &mut input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if result == 0 {
        return Err(format!(
            "failed to encrypt secure Twitch session: {}",
            Error::last_os_error()
        ));
    }

    let encrypted = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(encrypted)
}

#[cfg(target_os = "windows")]
fn unprotect_payload(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Error;
    use std::ptr::null_mut;
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: payload.len() as u32,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let result = unsafe {
        CryptUnprotectData(
            &mut input,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };

    if result == 0 {
        return Err(format!(
            "failed to decrypt secure Twitch session: {}",
            Error::last_os_error()
        ));
    }

    let decrypted = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(decrypted)
}

#[cfg(target_os = "windows")]
fn load_snapshot<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Option<Value>, String> {
    let path = session_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let encrypted =
        std::fs::read(&path).map_err(|e| format!("failed to read secure Twitch session: {e}"))?;
    let decrypted = unprotect_payload(&encrypted)?;
    let raw = String::from_utf8(decrypted)
        .map_err(|e| format!("failed to decode secure Twitch session: {e}"))?;
    serde_json::from_str::<Value>(&raw)
        .map(Some)
        .map_err(|e| format!("failed to parse secure Twitch session: {e}"))
}

#[cfg(target_os = "windows")]
fn save_snapshot<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &Value,
) -> Result<(), String> {
    let path = session_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create secure Twitch session dir: {e}"))?;
    }
    let payload = serde_json::to_vec(snapshot)
        .map_err(|e| format!("failed to serialize secure Twitch session: {e}"))?;
    let encrypted = protect_payload(&payload)?;
    let temp_path = path.with_extension("dat.tmp");
    std::fs::write(&temp_path, encrypted)
        .map_err(|e| format!("failed to write secure Twitch session: {e}"))?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("failed to replace secure Twitch session: {e}"))?;
    }
    std::fs::rename(&temp_path, &path)
        .map_err(|e| format!("failed to finalize secure Twitch session: {e}"))
}

#[cfg(target_os = "windows")]
fn clear_snapshot<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let path = session_path(app)?;
    if !path.exists() {
        return Ok(());
    }
    std::fs::remove_file(&path).map_err(|e| format!("failed to clear secure Twitch session: {e}"))
}

// ── Non-Windows: keyring ────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
fn session_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SESSION_SERVICE, SESSION_ACCOUNT)
        .map_err(|e| format!("failed to initialize secure Twitch session storage: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn load_snapshot<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) -> Result<Option<Value>, String> {
    let entry = session_entry()?;
    match entry.get_password() {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .map(Some)
            .map_err(|e| format!("failed to parse secure Twitch session: {e}")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read secure Twitch session: {e}")),
    }
}

#[cfg(not(target_os = "windows"))]
fn save_snapshot<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    snapshot: &Value,
) -> Result<(), String> {
    let entry = session_entry()?;
    let payload = serde_json::to_string(snapshot)
        .map_err(|e| format!("failed to serialize secure Twitch session: {e}"))?;
    entry
        .set_password(&payload)
        .map_err(|e| format!("failed to store secure Twitch session: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn clear_snapshot<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) -> Result<(), String> {
    let entry = session_entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to clear secure Twitch session: {e}")),
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_native_twitch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<Value>, String> {
    load_snapshot(&app)
}

#[tauri::command]
pub fn save_native_twitch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    snapshot: Value,
) -> Result<(), String> {
    save_snapshot(&app, &snapshot)
}

#[tauri::command]
pub fn clear_native_twitch_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    clear_snapshot(&app)
}

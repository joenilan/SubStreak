// SubStreak native shell.
//
// Deliberately slim: a single tray-resident window. The "minimize / close to
// system tray" behavior is ported from rocketsession — closing or minimizing
// hides the window instead of quitting, and the app keeps running in the tray
// (which is exactly the set-and-forget behavior we want while streaming).

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

mod app_state;
mod overlay;
mod twitch_session;

/// Bring the main window back to the foreground.
fn reveal_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Re-focus the existing window instead of opening a second instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            reveal_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            twitch_session::load_native_twitch_session,
            twitch_session::save_native_twitch_session,
            twitch_session::clear_native_twitch_session,
            app_state::load_substreak_state,
            app_state::save_substreak_state,
            app_state::clear_substreak_state,
            overlay::update_overlay_state,
            overlay::get_overlay_urls,
            overlay::set_overlay_network_mode,
        ])
        .setup(|app| {
            // ── OBS overlay loopback server ────────────────────────────────
            let overlay_state = overlay::OverlayState::new();
            if let Err(error) = overlay_state.start(false) {
                eprintln!("{error}");
            }
            app.manage(overlay_state);

            // ── System tray ────────────────────────────────────────────────
            let open = MenuItemBuilder::with_id("open", "Open SubStreak").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = MenuBuilder::new(app).items(&[&open, &sep, &quit]).build()?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SubStreak")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => reveal_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        reveal_main(tray.app_handle());
                    }
                });

            // Reuse the bundled app icon for the tray.
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;

            Ok(())
        })
        // ── Minimize / close → hide to tray (rocketsession behavior) ────────
        .on_window_event({
            let notice_shown = Arc::new(AtomicBool::new(false));
            move |window, event| {
                let hidden = match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        let _ = window.hide();
                        api.prevent_close();
                        true
                    }
                    WindowEvent::Resized(_) => {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.hide();
                            true
                        } else {
                            false
                        }
                    }
                    _ => false,
                };

                // Tell the user once where the app went.
                if hidden && !notice_shown.swap(true, Ordering::Relaxed) {
                    let handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        handle
                            .dialog()
                            .message(
                                "SubStreak is still running in the system tray.\n\nDouble-click the tray icon to bring it back.",
                            )
                            .title("Still running")
                            .show(|_| {});
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running SubStreak");
}

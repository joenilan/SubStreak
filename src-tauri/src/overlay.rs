// Loopback HTTP server for the OBS browser-source overlay.
//
// The front end pushes a small JSON payload to `update_overlay_state` whenever
// the goal/streak changes; this server serves a self-contained overlay page at
// `/` and that payload at `/state`. OBS points a browser source at the URL
// reported by `get_overlay_url`.

use std::net::{IpAddr, TcpListener as StdTcpListener};
use std::sync::{Arc, Mutex};

use axum::{
    http::header,
    response::Html,
    routing::get,
    Router,
};
use serde::Serialize;
use tauri::async_runtime::JoinHandle;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayUrls {
    pub overlay_url: String,
    pub preview_url: String,
    pub lan_url: Option<String>,
    pub lan_access_enabled: bool,
}

#[derive(Clone)]
pub struct OverlayState {
    payload: Arc<Mutex<String>>,
    urls: Arc<Mutex<OverlayUrls>>,
    task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl OverlayState {
    pub fn new() -> Self {
        Self {
            payload: Arc::new(Mutex::new("{}".to_string())),
            urls: Arc::new(Mutex::new(OverlayUrls::default())),
            task: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(&self, lan_enabled: bool) -> Result<OverlayUrls, String> {
        if let Ok(mut task) = self.task.lock() {
            if let Some(handle) = task.take() {
                handle.abort();
            }
        }

        let (listener, urls) = bind(lan_enabled).map_err(|error| {
            let mode = if lan_enabled { "LAN" } else { "loopback" };
            format!("failed to start {mode} overlay server: {error}")
        })?;

        if let Ok(mut guard) = self.urls.lock() {
            *guard = urls.clone();
        }

        let serve_state = self.clone();
        let handle = tauri::async_runtime::spawn(async move {
            serve(serve_state, listener).await;
        });

        if let Ok(mut task) = self.task.lock() {
            *task = Some(handle);
        }

        Ok(urls)
    }

    pub fn urls(&self) -> OverlayUrls {
        self.urls.lock().map(|urls| urls.clone()).unwrap_or_default()
    }
}

const OVERLAY_HTML: &str = include_str!("overlay.html");

#[tauri::command]
pub fn update_overlay_state(state: tauri::State<'_, OverlayState>, payload: String) {
    if let Ok(mut guard) = state.payload.lock() {
        *guard = payload;
    }
}

#[tauri::command]
pub fn get_overlay_urls(state: tauri::State<'_, OverlayState>) -> OverlayUrls {
    state.urls()
}

#[tauri::command]
pub fn set_overlay_network_mode(
    state: tauri::State<'_, OverlayState>,
    lan_enabled: bool,
) -> Result<OverlayUrls, String> {
    let urls = state.urls();
    if urls.lan_access_enabled == lan_enabled && !urls.preview_url.is_empty() {
        return Ok(urls);
    }
    state.start(lan_enabled)
}

/// Bind a port synchronously and return it with URLs, so the caller can report
/// the OBS source URL immediately. The listener is served on the async runtime.
fn bind(lan_enabled: bool) -> std::io::Result<(StdTcpListener, OverlayUrls)> {
    let host = if lan_enabled { "0.0.0.0" } else { "127.0.0.1" };
    let listener = StdTcpListener::bind((host, 0))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let preview_url = format!("http://127.0.0.1:{port}/");
    let lan_url = if lan_enabled {
        resolve_lan_url(port)
    } else {
        None
    };
    let overlay_url = lan_url.clone().unwrap_or_else(|| preview_url.clone());
    Ok((
        listener,
        OverlayUrls {
            overlay_url,
            preview_url,
            lan_url,
            lan_access_enabled: lan_enabled,
        },
    ))
}

fn resolve_lan_url(port: u16) -> Option<String> {
    match local_ip_address::local_ip().ok()? {
        IpAddr::V4(address) if address.is_private() => Some(format!("http://{address}:{port}/")),
        _ => None,
    }
}

async fn serve(state: OverlayState, std_listener: StdTcpListener) {
    let payload = state.payload.clone();

    let app = Router::new()
        .route("/", get(|| async { Html(OVERLAY_HTML) }))
        .route("/fonts/scond-300.woff2", get(|| font(include_bytes!("../fonts/scond-300.woff2"))))
        .route("/fonts/scond-500.woff2", get(|| font(include_bytes!("../fonts/scond-500.woff2"))))
        .route("/fonts/saira-400.woff2", get(|| font(include_bytes!("../fonts/saira-400.woff2"))))
        .route("/fonts/saira-600.woff2", get(|| font(include_bytes!("../fonts/saira-600.woff2"))))
        .route(
            "/state",
            get(move || {
                let payload = payload.clone();
                async move {
                    let body = payload.lock().map(|p| p.clone()).unwrap_or_else(|_| "{}".into());
                    (
                        [
                            (header::CONTENT_TYPE, "application/json"),
                            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
                            (header::CACHE_CONTROL, "no-store"),
                        ],
                        body,
                    )
                }
            }),
        );

    let Ok(listener) = tokio::net::TcpListener::from_std(std_listener) else {
        return;
    };
    let _ = axum::serve(listener, app).await;
}

async fn font(bytes: &'static [u8]) -> impl axum::response::IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "font/woff2"),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        bytes,
    )
}

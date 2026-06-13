// Loopback HTTP server for the OBS browser-source overlay.
//
// The front end pushes a small JSON payload to `update_overlay_state` whenever
// the goal/streak changes; this server serves a self-contained overlay page at
// `/` and that payload at `/state`. OBS points a browser source at the URL
// reported by `get_overlay_url`.

use std::net::TcpListener as StdTcpListener;
use std::sync::{Arc, Mutex};

use axum::{
    http::header,
    response::Html,
    routing::get,
    Router,
};

#[derive(Clone)]
pub struct OverlayState {
    payload: Arc<Mutex<String>>,
    port: Arc<Mutex<u16>>,
}

impl OverlayState {
    pub fn new() -> Self {
        Self {
            payload: Arc::new(Mutex::new("{}".to_string())),
            port: Arc::new(Mutex::new(0)),
        }
    }

    pub fn set_port(&self, port: u16) {
        if let Ok(mut guard) = self.port.lock() {
            *guard = port;
        }
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
pub fn get_overlay_url(state: tauri::State<'_, OverlayState>) -> String {
    let port = state.port.lock().map(|p| *p).unwrap_or(0);
    if port == 0 {
        String::new()
    } else {
        format!("http://127.0.0.1:{port}/")
    }
}

/// Bind a loopback port synchronously and return it with the std listener, so the
/// caller can report the URL immediately. The listener is served on the async runtime.
pub fn bind() -> std::io::Result<(StdTcpListener, u16)> {
    let listener = StdTcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

pub async fn serve(state: OverlayState, std_listener: StdTcpListener) {
    let payload = state.payload.clone();

    let app = Router::new()
        .route("/", get(|| async { Html(OVERLAY_HTML) }))
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

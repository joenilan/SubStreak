// Thin wrappers around the Tauri window for the custom (frameless) titlebar.
// No-ops in the browser dev shell.

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function minimizeWindow() {
  if (!isNativeRuntime()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

/** Close routes through the native CloseRequested handler, which hides to tray. */
export async function closeWindow() {
  if (!isNativeRuntime()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

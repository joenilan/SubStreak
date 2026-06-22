import { useEffect } from 'react'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Sensible default window sizes per view. The overlay editor needs room for a
// usable canvas; the goal view is compact. Both layouts are responsive, so the
// user can freely resize or maximize from here without ever getting a scrollbar.
// Settings sizes itself to its content (see SettingsView), so it's omitted here.
const SIZES: Record<string, { w: number; h: number }> = {
  goal: { w: 560, h: 470 },
  overlay: { w: 600, h: 720 },
}

/**
 * On view change, settle the window to that view's default size — unless the
 * user has maximized, in which case we leave it alone. No-op in the browser.
 */
export function useViewWindowSize(view: string) {
  useEffect(() => {
    if (!isNativeRuntime()) return
    const size = SIZES[view]
    if (!size) return // e.g. settings — it self-fits to content
    let cancelled = false
    void (async () => {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
      const w = getCurrentWindow()
      if (cancelled || (await w.isMaximized())) return
      const maxH = Math.max(360, window.screen.availHeight - 56)
      await w.setSize(new LogicalSize(size.w, Math.min(size.h, maxH)))
    })()
    return () => {
      cancelled = true
    }
  }, [view])
}

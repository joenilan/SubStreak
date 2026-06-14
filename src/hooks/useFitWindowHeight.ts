import { useEffect, type RefObject } from 'react'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Keep the desktop window height matched to its content: compact by default,
 * growing when the settings panel opens or the overlay editor is shown, with no
 * dead space. Width stays user-controlled (the overlay canvas scales with it).
 * No-op in the browser dev shell.
 */
export function useFitWindowHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!isNativeRuntime()) return
    const el = ref.current
    if (!el) return

    let last = 0
    let raf = 0

    const measureChrome = () => {
      const content = el.parentElement
      const cs = content ? getComputedStyle(content) : null
      const padV = cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 40
      const titlebar = document.querySelector('.titlebar') as HTMLElement | null
      const statusbar = document.querySelector('.statusbar') as HTMLElement | null
      return (titlebar?.offsetHeight ?? 38) + (statusbar?.offsetHeight ?? 30) + padV
    }

    const apply = async () => {
      const desired = Math.ceil(el.offsetHeight + measureChrome())
      // Don't exceed the usable screen; if clamped, the content area scrolls.
      const max = Math.max(360, window.screen.availHeight - 56)
      const h = Math.min(desired, max)
      if (Math.abs(h - last) < 2) return
      last = h
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
      const w = getCurrentWindow()
      const sf = await w.scaleFactor()
      const cur = await w.innerSize()
      const widthLogical = Math.round(cur.width / sf)
      await w.setSize(new LogicalSize(widthLogical, h))
    }

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => void apply())
    })
    ro.observe(el)
    void apply()

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

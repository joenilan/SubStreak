import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getDisplay } from '../lib/streak/engine'
import { useSubStreakStore } from '../state/useSubStreakStore'

interface OverlayUrls {
  overlayUrl: string
  previewUrl: string
  lanUrl: string | null
  lanAccessEnabled: boolean
}

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Pushes the current overlay payload to the native loopback server whenever the
 * goal/streak changes, and exposes the OBS browser-source URL.
 */
export function useOverlaySync(): OverlayUrls {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const overlay = useSubStreakStore((s) => s.overlay)
  const [urls, setUrls] = useState<OverlayUrls>({
    overlayUrl: '',
    previewUrl: '',
    lanUrl: null,
    lanAccessEnabled: false,
  })

  // Resolve the loopback URL once the server is up.
  useEffect(() => {
    if (!isNativeRuntime()) return
    let cancelled = false
    const applyUrls = (next: OverlayUrls) => {
      if (!cancelled) setUrls(next)
    }
    const poll = () => {
      invoke<OverlayUrls>('get_overlay_urls')
        .then((next) => {
          if (cancelled) return
          if (next.overlayUrl) applyUrls(next)
          else window.setTimeout(poll, 500)
        })
        .catch(() => {})
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [])

  // Switch between local-only and dual-PC LAN source mode.
  useEffect(() => {
    if (!isNativeRuntime()) return
    let cancelled = false
    invoke<OverlayUrls>('set_overlay_network_mode', { lanEnabled: overlay.lanAccessEnabled })
      .then((next) => {
        if (!cancelled) setUrls(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [overlay.lanAccessEnabled])

  // Push data + settings on every change.
  useEffect(() => {
    if (!isNativeRuntime()) return
    const view = getDisplay(streak, config)
    const payload = JSON.stringify({
      current: Math.min(view.rawCount, view.target),
      target: view.target,
      remaining: Math.max(0, view.target - view.rawCount),
      pct: Math.min(100, Math.round((view.rawCount / view.target) * 100)),
      goalHit: view.goalHitToday,
      streak: view.streak,
      best: view.longestStreak,
      live: view.liveToday,
      settings: overlay,
    })
    invoke('update_overlay_state', { payload }).catch(() => {})
  }, [config, streak, overlay])

  return urls
}

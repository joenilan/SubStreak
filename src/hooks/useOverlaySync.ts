import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getDisplay } from '../lib/streak/engine'
import { useSubStreakStore } from '../state/useSubStreakStore'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Pushes the current overlay payload to the native loopback server whenever the
 * goal/streak changes, and exposes the OBS browser-source URL.
 */
export function useOverlaySync(): { overlayUrl: string } {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const [overlayUrl, setOverlayUrl] = useState('')

  // Resolve the loopback URL once the server is up.
  useEffect(() => {
    if (!isNativeRuntime()) return
    let cancelled = false
    const poll = () => {
      invoke<string>('get_overlay_url')
        .then((url) => {
          if (cancelled) return
          if (url) setOverlayUrl(url)
          else window.setTimeout(poll, 500)
        })
        .catch(() => {})
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [])

  // Push payload on every change.
  useEffect(() => {
    if (!isNativeRuntime()) return
    const view = getDisplay(streak, config)
    const payload = JSON.stringify({
      current: Math.min(view.rawCount, view.target),
      target: view.target,
      pct: Math.min(100, Math.round((view.rawCount / view.target) * 100)),
      goalHit: view.goalHitToday,
      streak: view.streak,
      best: view.longestStreak,
      live: view.liveToday,
    })
    invoke('update_overlay_state', { payload }).catch(() => {})
  }, [config, streak])

  return { overlayUrl }
}

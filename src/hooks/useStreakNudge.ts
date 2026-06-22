import { useEffect, useRef } from 'react'
import { getDisplay } from '../lib/streak/engine'
import { useSubStreakStore } from '../state/useSubStreakStore'

// Nudge once you've been live this long in the current period without hitting goal.
const NUDGE_AFTER_MS = 40 * 60_000

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Sends a single desktop notification when you're live and still haven't hit the
 * sub goal after a while — so you don't lose a streak while heads-down streaming
 * with the app in the tray. Resets each time you go offline / hit the goal.
 */
export function useStreakNudge() {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)

  const liveSince = useRef<number | null>(null)
  const nudged = useRef(false)

  useEffect(() => {
    if (!isNativeRuntime()) return
    let cancelled = false

    const evaluate = async () => {
      const view = getDisplay(streak, config)
      if (!(config.nudgeAtRisk ?? true) || !view.liveToday) {
        liveSince.current = null
        nudged.current = false
        return
      }
      if (view.goalHitToday) {
        nudged.current = true // safe this period — nothing to nudge about
        return
      }
      const now = Date.now()
      if (liveSince.current === null) liveSince.current = now
      if (nudged.current || now - liveSince.current < NUDGE_AFTER_MS) return

      nudged.current = true
      try {
        const { isPermissionGranted, requestPermission, sendNotification } = await import(
          '@tauri-apps/plugin-notification'
        )
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        if (cancelled || !granted) return
        const remaining = Math.max(0, view.target - view.rawCount)
        sendNotification({
          title: 'Sub goal not hit yet',
          body:
            streak.streak > 0
              ? `You're live and ${remaining} away from goal — keep your ${streak.streak}-streak alive!`
              : `You're live and ${remaining} away from your sub goal.`,
        })
      } catch {
        /* notifications unavailable — ignore */
      }
    }

    void evaluate()
    const id = window.setInterval(() => void evaluate(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [config, streak])
}

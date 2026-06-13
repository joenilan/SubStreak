import { useCallback, useEffect, useRef } from 'react'
import {
  pollDeviceCode,
  refreshAccessToken,
  requestDeviceCode,
  TwitchRefreshRejectedError,
  TwitchUnauthorizedError,
  validateAccessToken,
} from '../lib/twitch/client'
import {
  isTwitchConfigured,
  TWITCH_CLIENT_ID,
  TWITCH_REFRESH_EARLY_MS,
  TWITCH_SCOPES,
  TWITCH_VALIDATE_INTERVAL_MS,
} from '../lib/twitch/constants'
import type { TwitchTokenSet } from '../lib/twitch/types'
import {
  buildNativeTwitchSessionSnapshot,
  clearNativeTwitchSessionSnapshot,
  loadNativeTwitchSessionSnapshot,
  saveNativeTwitchSessionSnapshot,
} from '../lib/platform/nativeTwitchSession'
import { useTwitchStore } from '../state/useTwitchStore'

export interface TwitchAuthActions {
  login: () => Promise<void>
  cancelLogin: () => void
  logout: () => Promise<void>
}

export function useTwitchAuth(): TwitchAuthActions {
  const set = useTwitchStore((s) => s.set)
  const reset = useTwitchStore((s) => s.reset)
  const pollTimer = useRef<number | null>(null)
  const bootstrapped = useRef(false)

  const persist = useCallback(
    async (tokens: TwitchTokenSet | null, session: Awaited<ReturnType<typeof validateAccessToken>> | null) => {
      await saveNativeTwitchSessionSnapshot(buildNativeTwitchSessionSnapshot({ tokens, session }))
    },
    [],
  )

  const refresh = useCallback(
    async (refreshToken: string): Promise<boolean> => {
      set({ status: 'refreshing' })
      try {
        const exchange = await refreshAccessToken(TWITCH_CLIENT_ID, refreshToken)
        const tokens: TwitchTokenSet = {
          accessToken: exchange.accessToken,
          refreshToken: exchange.refreshToken,
          expiresAt: exchange.expiresAt,
        }
        const session = await validateAccessToken(tokens.accessToken)
        set({ tokens, session, status: 'connected', error: null })
        await persist(tokens, session)
        return true
      } catch (error) {
        if (error instanceof TwitchRefreshRejectedError) {
          await clearNativeTwitchSessionSnapshot()
          reset()
          set({ status: 'reconnect-required', error: 'Please sign in to Twitch again.' })
          return false
        }
        set({ status: 'error', error: error instanceof Error ? error.message : 'Twitch refresh failed.' })
        return false
      }
    },
    [persist, reset, set],
  )

  /** Validate (and if needed refresh) a token set, updating the store + storage. */
  const activate = useCallback(
    async (tokens: TwitchTokenSet): Promise<boolean> => {
      try {
        const session = await validateAccessToken(tokens.accessToken)
        set({ tokens, session, status: 'connected', error: null })
        await persist(tokens, session)
        return true
      } catch (error) {
        if (error instanceof TwitchUnauthorizedError) {
          return refresh(tokens.refreshToken)
        }
        set({ status: 'error', error: error instanceof Error ? error.message : 'Twitch validation failed.' })
        return false
      }
    },
    [persist, refresh, set],
  )

  // ── Bootstrap: load saved session on launch ──────────────────────────────
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      if (!isTwitchConfigured()) {
        set({ status: 'idle', error: 'Set VITE_TWITCH_CLIENT_ID to enable Twitch login.' })
        return
      }
      set({ status: 'bootstrapping' })
      const snapshot = await loadNativeTwitchSessionSnapshot()
      if (!snapshot?.tokens) {
        set({ status: 'idle' })
        return
      }
      await activate(snapshot.tokens)
    })()
  }, [activate, set])

  // ── Background keep-alive: refresh early, re-validate hourly ──────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      const { tokens, status } = useTwitchStore.getState()
      if (!tokens || status !== 'connected') return
      const msLeft = tokens.expiresAt - Date.now()
      if (msLeft <= TWITCH_REFRESH_EARLY_MS) {
        void refresh(tokens.refreshToken)
      }
    }, 60_000)

    const validateId = window.setInterval(() => {
      const { tokens, status } = useTwitchStore.getState()
      if (!tokens || status !== 'connected') return
      void validateAccessToken(tokens.accessToken).catch(() => refresh(tokens.refreshToken))
    }, TWITCH_VALIDATE_INTERVAL_MS)

    return () => {
      window.clearInterval(id)
      window.clearInterval(validateId)
    }
  }, [refresh])

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const login = useCallback(async () => {
    if (!isTwitchConfigured()) {
      set({ status: 'error', error: 'Set VITE_TWITCH_CLIENT_ID first.' })
      return
    }
    stopPolling()
    set({ status: 'authorizing', error: null })

    const flow = await requestDeviceCode(TWITCH_CLIENT_ID, TWITCH_SCOPES)
    set({ deviceFlow: flow })

    let intervalMs = flow.intervalSeconds * 1000
    const tick = async () => {
      try {
        const result = await pollDeviceCode(TWITCH_CLIENT_ID, flow.deviceCode, TWITCH_SCOPES)
        if (result.kind === 'success') {
          stopPolling()
          set({ deviceFlow: null })
          await activate({
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresAt: result.tokens.expiresAt,
          })
          return
        }
        if (result.kind === 'denied' || result.kind === 'expired') {
          stopPolling()
          set({
            status: 'error',
            deviceFlow: null,
            error: result.kind === 'denied' ? 'Authorization was denied.' : 'The code expired. Try again.',
          })
          return
        }
        if (result.kind === 'slow_down') intervalMs += 1000
      } catch (error) {
        stopPolling()
        set({ status: 'error', deviceFlow: null, error: error instanceof Error ? error.message : 'Login failed.' })
        return
      }
      pollTimer.current = window.setTimeout(() => void tick(), intervalMs)
    }
    pollTimer.current = window.setTimeout(() => void tick(), intervalMs)
  }, [activate, set, stopPolling])

  const cancelLogin = useCallback(() => {
    stopPolling()
    set({ deviceFlow: null, status: 'idle' })
  }, [set, stopPolling])

  const logout = useCallback(async () => {
    stopPolling()
    await clearNativeTwitchSessionSnapshot()
    reset()
  }, [reset, stopPolling])

  useEffect(() => stopPolling, [stopPolling])

  return { login, cancelLogin, logout }
}

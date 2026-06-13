import { invoke } from '@tauri-apps/api/core'
import type { TwitchTokenSet, TwitchValidatedSession } from '../twitch/types'

const BROWSER_KEY = 'substreak.twitch.session'

export interface NativeTwitchSessionSnapshot {
  version: 1
  tokens: TwitchTokenSet | null
  session: TwitchValidatedSession | null
}

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function parseBrowserSnapshot(raw: string | null): NativeTwitchSessionSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as NativeTwitchSessionSnapshot
    return parsed?.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export async function loadNativeTwitchSessionSnapshot(): Promise<NativeTwitchSessionSnapshot | null> {
  if (!isNativeRuntime()) {
    return parseBrowserSnapshot(window.localStorage.getItem(BROWSER_KEY))
  }
  const snapshot = await invoke<NativeTwitchSessionSnapshot | null>('load_native_twitch_session')
  return snapshot?.version === 1 ? snapshot : null
}

export async function saveNativeTwitchSessionSnapshot(snapshot: NativeTwitchSessionSnapshot) {
  if (!isNativeRuntime()) {
    window.localStorage.setItem(BROWSER_KEY, JSON.stringify(snapshot))
    return
  }
  await invoke('save_native_twitch_session', { snapshot })
}

export async function clearNativeTwitchSessionSnapshot() {
  if (!isNativeRuntime()) {
    window.localStorage.removeItem(BROWSER_KEY)
    return
  }
  await invoke('clear_native_twitch_session')
}

export function buildNativeTwitchSessionSnapshot(input: {
  tokens: TwitchTokenSet | null
  session: TwitchValidatedSession | null
}): NativeTwitchSessionSnapshot {
  return { version: 1, tokens: input.tokens, session: input.session }
}

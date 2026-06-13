import { invoke } from '@tauri-apps/api/core'
import type { StateStorage } from 'zustand/middleware'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * zustand storage backed by a native JSON file (via Tauri commands) when running
 * in the desktop app, falling back to localStorage in the browser dev shell.
 * The native side keeps a single state file, so the `name` key is only used for
 * the browser fallback.
 */
export const nativeStateStorage: StateStorage = {
  getItem: async (name) => {
    if (!isNativeRuntime()) return window.localStorage.getItem(name)
    return (await invoke<string | null>('load_substreak_state')) ?? null
  },
  setItem: async (name, value) => {
    if (!isNativeRuntime()) {
      window.localStorage.setItem(name, value)
      return
    }
    await invoke('save_substreak_state', { value })
  },
  removeItem: async (name) => {
    if (!isNativeRuntime()) {
      window.localStorage.removeItem(name)
      return
    }
    await invoke('clear_substreak_state')
  },
}

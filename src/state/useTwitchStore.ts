import { create } from 'zustand'
import type {
  TwitchAuthStatus,
  TwitchDeviceCodeFlow,
  TwitchTokenSet,
  TwitchValidatedSession,
} from '../lib/twitch/types'

interface TwitchStore {
  status: TwitchAuthStatus
  session: TwitchValidatedSession | null
  tokens: TwitchTokenSet | null
  deviceFlow: TwitchDeviceCodeFlow | null
  error: string | null
  // EventSub connection status, surfaced for the UI.
  eventSubConnected: boolean

  set: (patch: Partial<TwitchStore>) => void
  reset: () => void
}

const initial = {
  status: 'idle' as TwitchAuthStatus,
  session: null,
  tokens: null,
  deviceFlow: null,
  error: null,
  eventSubConnected: false,
}

export const useTwitchStore = create<TwitchStore>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial }),
}))

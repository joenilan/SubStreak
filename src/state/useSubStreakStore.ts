import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyInput } from '../lib/streak/engine'
import {
  createInitialState,
  DEFAULT_CONFIG,
  type StreakInput,
  type SubStreakConfig,
  type SubStreakState,
} from '../lib/streak/types'

/** A StreakInput where `at` is optional (defaults to now). Distributes over the union. */
type IngestInput =
  | { kind: 'sub'; count?: number; at?: Date }
  | { kind: 'stream-online'; at?: Date }
  | { kind: 'tick'; at?: Date }

interface SubStreakStore {
  config: SubStreakConfig
  streak: SubStreakState
  /** Core: feed any engine input. Twitch wiring and dev controls both go through here. */
  ingest: (input: IngestInput) => void
  /** Roll the day over / finalize without an event (launch + periodic). */
  tick: () => void
  // dev/manual controls
  simulateSub: (count?: number) => void
  goLive: () => void
  setTarget: (target: number) => void
  setRolloverHour: (hour: number) => void
  hardReset: () => void
}

export const useSubStreakStore = create<SubStreakStore>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },
      streak: createInitialState(),

      ingest: (input) => {
        const { config, streak } = get()
        const full = { ...input, at: input.at ?? new Date() } as StreakInput
        set({ streak: applyInput(streak, full, config) })
      },

      tick: () => get().ingest({ kind: 'tick' }),

      simulateSub: (count = 1) => get().ingest({ kind: 'sub', count }),

      goLive: () => get().ingest({ kind: 'stream-online' }),

      setTarget: (target) => {
        set((s) => ({ config: { ...s.config, dailyGoalTarget: Math.max(1, Math.round(target)) } }))
        // Re-evaluate immediately in case the new target is already met on a live day.
        get().tick()
      },

      setRolloverHour: (hour) => {
        const clamped = ((Math.round(hour) % 24) + 24) % 24
        set((s) => ({ config: { ...s.config, dayRolloverHour: clamped } }))
        get().tick()
      },

      hardReset: () => set({ streak: createInitialState() }),
    }),
    {
      name: 'substreak-state-v1',
      // Persist only data, never the action closures.
      partialize: (s) => ({ config: s.config, streak: s.streak }),
    },
  ),
)

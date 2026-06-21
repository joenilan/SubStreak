import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { nativeStateStorage } from '../lib/platform/nativeStateStorage'
import { applyInput } from '../lib/streak/engine'
import {
  clamp,
  cloneOverlay,
  DEFAULT_OVERLAY,
  isNewOverlay,
  migrateOverlay,
  newTextElement,
  type OverlayElement,
  type OverlayGroup,
  type OverlaySettings,
} from '../lib/overlay/types'
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
  overlay: OverlaySettings
  /** Global overlay fields: opacity, resolution, LAN. */
  setOverlay: (patch: Partial<Pick<OverlaySettings, 'opacity' | 'resolution' | 'lanAccessEnabled'>>) => void
  setOverlayGroup: (patch: Partial<OverlayGroup>) => void
  setElement: (id: string, patch: Partial<OverlayElement>) => void
  toggleGroup: (grouped: boolean) => void
  addTextElement: () => void
  duplicateElement: (id: string) => void
  removeElement: (id: string) => void
  resetOverlay: () => void
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
      overlay: cloneOverlay(DEFAULT_OVERLAY),

      setOverlay: (patch) =>
        set((s) => ({
          overlay: {
            ...s.overlay,
            ...patch,
            opacity: patch.opacity !== undefined ? clamp(patch.opacity, 0, 100) : s.overlay.opacity,
          },
        })),

      setOverlayGroup: (patch) =>
        set((s) => ({
          overlay: {
            ...s.overlay,
            group: {
              ...s.overlay.group,
              ...patch,
              x: patch.x !== undefined ? clamp(patch.x, 0, 100) : s.overlay.group.x,
              y: patch.y !== undefined ? clamp(patch.y, 0, 100) : s.overlay.group.y,
              scale: patch.scale !== undefined ? clamp(patch.scale, 50, 200) : s.overlay.group.scale,
              rotation: patch.rotation !== undefined ? clamp(patch.rotation, -180, 180) : s.overlay.group.rotation,
              gap: patch.gap !== undefined ? clamp(patch.gap, 0, 200) : s.overlay.group.gap,
            },
          },
        })),

      setElement: (id, patch) =>
        set((s) => ({
          overlay: {
            ...s.overlay,
            elements: s.overlay.elements.map((el) =>
              el.id !== id
                ? el
                : {
                    ...el,
                    ...patch,
                    x: patch.x !== undefined ? clamp(patch.x, 0, 100) : el.x,
                    y: patch.y !== undefined ? clamp(patch.y, 0, 100) : el.y,
                    scale: patch.scale !== undefined ? clamp(patch.scale, 50, 200) : el.scale,
                    rotation: patch.rotation !== undefined ? clamp(patch.rotation, -180, 180) : el.rotation,
                    fontSize: patch.fontSize !== undefined ? clamp(patch.fontSize, 8, 200) : el.fontSize,
                  },
            ),
          },
        })),

      toggleGroup: (grouped) =>
        set((s) => ({ overlay: { ...s.overlay, group: { ...s.overlay.group, grouped } } })),

      addTextElement: () =>
        set((s) => ({ overlay: { ...s.overlay, elements: [...s.overlay.elements, newTextElement()] } })),

      duplicateElement: (id) =>
        set((s) => {
          const el = s.overlay.elements.find((e) => e.id === id)
          if (!el || el.kind !== 'text') return s
          const copy: OverlayElement = {
            ...el,
            id: newTextElement().id,
            x: clamp(el.x + 4, 0, 100),
            y: clamp(el.y + 4, 0, 100),
          }
          const idx = s.overlay.elements.findIndex((e) => e.id === id)
          const elements = [...s.overlay.elements]
          elements.splice(idx + 1, 0, copy)
          return { overlay: { ...s.overlay, elements } }
        }),

      removeElement: (id) =>
        set((s) => ({
          // Built-in goal/streak lines are toggled via `visible`, not removed.
          overlay: {
            ...s.overlay,
            elements: s.overlay.elements.filter((el) => el.kind === 'text' ? el.id !== id : true),
          },
        })),

      resetOverlay: () => set({ overlay: cloneOverlay(DEFAULT_OVERLAY) }),

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
      storage: createJSONStorage(() => nativeStateStorage),
      // Persist only data, never the action closures.
      partialize: (s) => ({ config: s.config, streak: s.streak, overlay: s.overlay }),
      // Deep-merge so fields added in newer versions are backfilled, and migrate
      // the pre-elements overlay shape (single mode + one position) on the fly.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SubStreakStore>
        const savedOverlay = p.overlay as unknown
        const overlay = savedOverlay
          ? isNewOverlay(savedOverlay)
            ? {
                ...current.overlay,
                ...savedOverlay,
                resolution: savedOverlay.resolution ?? current.overlay.resolution,
                group: { ...current.overlay.group, ...savedOverlay.group },
                elements: savedOverlay.elements?.length ? savedOverlay.elements : current.overlay.elements,
              }
            : migrateOverlay(savedOverlay)
          : current.overlay
        return {
          ...current,
          ...p,
          config: { ...current.config, ...(p.config ?? {}) },
          streak: { ...current.streak, ...(p.streak ?? {}) },
          overlay,
        }
      },
    },
  ),
)

// SubStreak core types. Pure data — no Tauri/React/Twitch imports here.

export interface SubStreakConfig {
  /** Subs needed in a stream day to "hit" the daily goal. Default 1. */
  dailyGoalTarget: number
  /**
   * Local hour (0-23) at which a new "stream day" begins. Default 0 (midnight).
   * Set to ~5-6 so a stream that runs past midnight still counts as the same day.
   * Times before this hour belong to the previous stream day.
   */
  dayRolloverHour: number
  /** IANA timezone (e.g. "America/Los_Angeles"). Undefined = system local. */
  timeZone?: string
}

export const DEFAULT_CONFIG: SubStreakConfig = {
  dailyGoalTarget: 1,
  dayRolloverHour: 0,
}

export interface SubStreakState {
  /** Stream-day key we're currently accumulating into, e.g. "2026-06-13". Null before first event. */
  currentDay: string | null
  /** Subs counted during currentDay. Drives the "Daily sub goal: X/N" display. */
  todaySubCount: number
  /** Did the channel go live during currentDay? Streak only moves on live days. */
  wasLiveToday: boolean
  /** Have we already credited currentDay's goal-hit to the streak? Prevents double counting. */
  goalCreditedToday: boolean
  /** Current consecutive-streamed-day streak. */
  streak: number
  /** Best streak ever reached (nice for the overlay). */
  longestStreak: number
  /** Last stream day whose goal was hit. */
  lastGoalHitDay: string | null
}

export function createInitialState(): SubStreakState {
  return {
    currentDay: null,
    todaySubCount: 0,
    wasLiveToday: false,
    goalCreditedToday: false,
    streak: 0,
    longestStreak: 0,
    lastGoalHitDay: null,
  }
}

export type StreakInput =
  /** A counted subscription event. `count` carries gift-bomb quantity (default 1). */
  | { kind: 'sub'; at: Date; count?: number }
  /** Channel went live (Twitch EventSub `stream.online`). */
  | { kind: 'stream-online'; at: Date }
  /** No-op trigger (app launch / periodic) used only to roll the day over and finalize. */
  | { kind: 'tick'; at: Date }

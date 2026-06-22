// SubStreak core types. Pure data — no Tauri/React/Twitch imports here.

/** How the streak is counted. */
export type StreakBasis = 'day' | 'stream'

export interface SubStreakConfig {
  /** Subs needed to "hit" the goal (per stream day, or per stream session). Default 1. */
  dailyGoalTarget: number
  /**
   * Local hour (0-23) at which a new "stream day" begins. Default 0 (midnight).
   * Set to ~5-6 so a stream that runs past midnight still counts as the same day.
   * Times before this hour belong to the previous stream day. (Day basis only.)
   */
  dayRolloverHour: number
  /** IANA timezone (e.g. "America/Los_Angeles"). Undefined = system local. */
  timeZone?: string
  /**
   * 'day'    → one streak step per streamed day (off days neutral). Legacy default.
   * 'stream' → one streak step per stream session; each go-live is a fresh attempt.
   * Undefined is treated as 'day' by the engine for backward compatibility.
   */
  streakBasis?: StreakBasis
  /**
   * Stream basis only: a reconnect within this many minutes of going offline
   * continues the same stream (count is kept). Default 10.
   */
  reconnectGraceMinutes?: number
  /** Play a sound when the goal is hit. Default true. */
  celebrateSound?: boolean
  /** Send a desktop notification if you're live a while without hitting the goal. Default true. */
  nudgeAtRisk?: boolean
}

export const DEFAULT_CONFIG: SubStreakConfig = {
  dailyGoalTarget: 1,
  dayRolloverHour: 0,
  streakBasis: 'stream',
  reconnectGraceMinutes: 10,
  celebrateSound: true,
  nudgeAtRisk: true,
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
  /** Current consecutive streak (streamed days, or stream sessions, per basis). */
  streak: number
  /** Best streak ever reached (nice for the overlay). */
  longestStreak: number
  /** Last stream day whose goal was hit. */
  lastGoalHitDay: string | null

  // ── Stream-session accumulators (streakBasis === 'stream') ────────────────
  /** Currently live within a stream session (between online and offline). */
  streamLive: boolean
  /** Subs counted in the current stream session. */
  sessionSubCount: number
  /** Already credited this session's goal-hit to the streak. */
  sessionGoalCredited: boolean
  /** Epoch ms when the stream went offline; non-null while inside the reconnect grace window. */
  offlineSince: number | null
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
    streamLive: false,
    sessionSubCount: 0,
    sessionGoalCredited: false,
    offlineSince: null,
  }
}

export type StreakInput =
  /** A counted subscription event. `count` carries gift-bomb quantity (default 1). */
  | { kind: 'sub'; at: Date; count?: number }
  /** Channel went live (Twitch EventSub `stream.online`). */
  | { kind: 'stream-online'; at: Date }
  /** Channel went offline (Twitch EventSub `stream.offline`). */
  | { kind: 'stream-offline'; at: Date }
  /** No-op trigger (app launch / periodic) used only to roll the day/session over and finalize. */
  | { kind: 'tick'; at: Date }

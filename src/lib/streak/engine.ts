// SubStreak engine — pure reducer for the daily sub goal + daily streak.
//
// The streak runs over *streamed* days only. Days you didn't go live are neutral:
// they neither extend nor break the streak. A streamed day that misses the goal
// breaks it. The decision for a day is made lazily, when a later event reveals the
// day has rolled over — so a missed goal yesterday breaks the streak as soon as the
// app sees any event (including a launch `tick`) today.

import {
  type StreakInput,
  type SubStreakConfig,
  type SubStreakState,
} from './types'

/**
 * Resolve the stream-day key (YYYY-MM-DD) for an instant, honoring the configured
 * rollover hour and timezone. Subtracting the rollover hour shifts early-morning
 * hours back into the previous calendar day.
 */
export function getStreamDayKey(at: Date, config: SubStreakConfig): string {
  const shifted = new Date(at.getTime() - config.dayRolloverHour * 3_600_000)
  // en-CA formats as YYYY-MM-DD; timeZone undefined → system local.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted)
}

/**
 * Apply one input to the state and return the next state. Pure — no I/O, no Date.now().
 * The caller supplies `at` so this is deterministic and testable.
 *
 * Dispatches on the configured streak basis. `streamBasis` undefined → 'day' so
 * the legacy reducer (and its tests) keep working unchanged.
 */
export function applyInput(
  state: SubStreakState,
  input: StreakInput,
  config: SubStreakConfig,
): SubStreakState {
  if ((config.streakBasis ?? 'day') === 'stream') {
    return applyStreamInput(state, input, config)
  }
  return applyDayInput(state, input, config)
}

function applyDayInput(
  state: SubStreakState,
  input: StreakInput,
  config: SubStreakConfig,
): SubStreakState {
  const dayKey = getStreamDayKey(input.at, config)
  let next: SubStreakState = { ...state }

  // 1. Day rollover: close out the previous day before touching the new one.
  if (next.currentDay !== dayKey) {
    next = finalizeDay(next)
    next.currentDay = dayKey
    next.todaySubCount = 0
    next.wasLiveToday = false
    next.goalCreditedToday = false
  }

  // 2. Apply the event to today's accumulators.
  switch (input.kind) {
    case 'sub':
      next.todaySubCount += Math.max(1, input.count ?? 1)
      break
    case 'stream-online':
      next.wasLiveToday = true
      break
    case 'stream-offline':
      // Day basis ignores session boundaries.
      break
    case 'tick':
      // No accumulator change; the rollover check above is the whole point.
      break
  }

  // 3. Credit today's goal to the streak the moment it's reached on a live day.
  //    Re-checked on every input, so subs landing before going live still credit
  //    once `stream-online` arrives.
  return maybeCreditStreak(next, config)
}

/**
 * Decide the streak impact of the day that just ended (state.currentDay).
 *   - streamed + goal already credited  → keep streak (it grew when the goal hit)
 *   - streamed + goal NOT credited       → break: streak = 0
 *   - not streamed                       → neutral: streak unchanged
 * Multiple idle days collapse to one neutral finalize, because days with no events
 * were never marked live.
 */
function finalizeDay(state: SubStreakState): SubStreakState {
  if (state.currentDay === null) return state
  if (state.wasLiveToday && !state.goalCreditedToday) {
    return { ...state, streak: 0 }
  }
  return state
}

function maybeCreditStreak(
  state: SubStreakState,
  config: SubStreakConfig,
): SubStreakState {
  if (state.goalCreditedToday) return state
  if (!state.wasLiveToday) return state
  if (state.todaySubCount < config.dailyGoalTarget) return state

  const streak = state.streak + 1
  return {
    ...state,
    goalCreditedToday: true,
    streak,
    longestStreak: Math.max(state.longestStreak, streak),
    lastGoalHitDay: state.currentDay,
  }
}

// ── Stream-session basis ────────────────────────────────────────────────────
//
// One streak step per stream session. Going live starts (or, within the
// reconnect grace, resumes) a session; hitting the goal during a live session
// credits the streak once; a session that ends under goal breaks it. Off time
// between sessions is neutral. The "session ended" decision is made lazily once
// the reconnect grace has elapsed (on the next event or periodic tick).

function applyStreamInput(
  state: SubStreakState,
  input: StreakInput,
  config: SubStreakConfig,
): SubStreakState {
  const target = config.dailyGoalTarget
  const graceMs = (config.reconnectGraceMinutes ?? 10) * 60_000
  const nowMs = input.at.getTime()
  let next: SubStreakState = { ...state }

  // 1. Close a session whose reconnect grace has expired (break if uncredited).
  if (!next.streamLive && next.offlineSince !== null && nowMs - next.offlineSince > graceMs) {
    next = closeStreamSession(next)
  }

  // 2. Apply the event.
  switch (input.kind) {
    case 'stream-online':
      if (!next.streamLive) {
        if (next.offlineSince !== null) {
          // Reconnected within grace → resume the same session, keep the count.
          next.streamLive = true
          next.offlineSince = null
        } else {
          // Fresh session.
          next.streamLive = true
          next.sessionSubCount = 0
          next.sessionGoalCredited = false
        }
      }
      break
    case 'stream-offline':
      if (next.streamLive) {
        next.streamLive = false
        next.offlineSince = nowMs // enter the reconnect grace window
      }
      break
    case 'sub':
      if (next.streamLive) next.sessionSubCount += Math.max(1, input.count ?? 1)
      break
    case 'tick':
      // Only the grace-expiry check above matters.
      break
  }

  // 3. Credit the streak the moment the goal is reached during a live session.
  if (next.streamLive && !next.sessionGoalCredited && next.sessionSubCount >= target) {
    const streak = next.streak + 1
    next = {
      ...next,
      sessionGoalCredited: true,
      streak,
      longestStreak: Math.max(next.longestStreak, streak),
      lastGoalHitDay: getStreamDayKey(input.at, config),
    }
  }
  return next
}

/** Resolve a session that has ended: break the streak if its goal was never met, then reset session accumulators. */
function closeStreamSession(state: SubStreakState): SubStreakState {
  return {
    ...state,
    streak: state.sessionGoalCredited ? state.streak : 0,
    streamLive: false,
    offlineSince: null,
    sessionSubCount: 0,
    sessionGoalCredited: false,
  }
}

/** Convenience view model for the UI/overlay. Reflects the active streak basis. */
export function getDisplay(state: SubStreakState, config: SubStreakConfig) {
  if ((config.streakBasis ?? 'day') === 'stream') {
    return {
      goalText: `Stream sub goal: ${Math.min(state.sessionSubCount, config.dailyGoalTarget)}/${config.dailyGoalTarget}`,
      rawCount: state.sessionSubCount,
      target: config.dailyGoalTarget,
      goalHitToday: state.sessionGoalCredited,
      streak: state.streak,
      longestStreak: state.longestStreak,
      liveToday: state.streamLive,
    }
  }
  return {
    goalText: `Daily sub goal: ${Math.min(state.todaySubCount, config.dailyGoalTarget)}/${config.dailyGoalTarget}`,
    rawCount: state.todaySubCount,
    target: config.dailyGoalTarget,
    goalHitToday: state.goalCreditedToday,
    streak: state.streak,
    longestStreak: state.longestStreak,
    liveToday: state.wasLiveToday,
  }
}

import { describe, expect, it } from 'vitest'
import { applyInput, getDisplay, getStreamDayKey } from './engine'
import { createInitialState, type StreakInput, type SubStreakConfig } from './types'

// Fixed UTC config so day keys are deterministic regardless of where tests run.
const cfg = (over: Partial<SubStreakConfig> = {}): SubStreakConfig => ({
  dailyGoalTarget: 1,
  dayRolloverHour: 0,
  timeZone: 'UTC',
  ...over,
})

const at = (iso: string): Date => new Date(iso)

// Replay a sequence of inputs from a fresh state.
function run(inputs: StreakInput[], config = cfg()) {
  return inputs.reduce((state, input) => applyInput(state, input, config), createInitialState())
}

describe('getStreamDayKey', () => {
  it('uses calendar date at midnight rollover', () => {
    expect(getStreamDayKey(at('2026-06-13T23:59:00Z'), cfg())).toBe('2026-06-13')
    expect(getStreamDayKey(at('2026-06-14T00:01:00Z'), cfg())).toBe('2026-06-14')
  })

  it('keeps post-midnight hours on the previous day with a 6am rollover', () => {
    const c = cfg({ dayRolloverHour: 6 })
    expect(getStreamDayKey(at('2026-06-14T02:00:00Z'), c)).toBe('2026-06-13')
    expect(getStreamDayKey(at('2026-06-14T05:59:00Z'), c)).toBe('2026-06-13')
    expect(getStreamDayKey(at('2026-06-14T06:00:00Z'), c)).toBe('2026-06-14')
  })
})

describe('rule 4 → credit: goal hit on a live day', () => {
  it('increments the streak when the goal is reached while live', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') },
    ])
    expect(s.streak).toBe(1)
    expect(s.goalCreditedToday).toBe(true)
    expect(getDisplay(s, cfg()).goalText).toBe('Daily sub goal: 1/1')
  })

  it('does NOT credit if the goal is hit while offline, then credits once live', () => {
    const subFirst = run([{ kind: 'sub', at: at('2026-06-13T19:00:00Z') }])
    expect(subFirst.streak).toBe(0)
    expect(subFirst.wasLiveToday).toBe(false)

    const thenLive = applyInput(
      subFirst,
      { kind: 'stream-online', at: at('2026-06-13T19:30:00Z') },
      cfg(),
    )
    expect(thenLive.streak).toBe(1)
  })

  it('counts gift-bomb quantity toward the goal', () => {
    const s = run(
      [
        { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
        { kind: 'sub', at: at('2026-06-13T20:05:00Z'), count: 5 },
      ],
      cfg({ dailyGoalTarget: 5 }),
    )
    expect(s.streak).toBe(1)
    expect(getDisplay(s, cfg({ dailyGoalTarget: 5 })).goalText).toBe('Daily sub goal: 5/5')
  })

  it('credits a day only once no matter how many subs arrive', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:01:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:02:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:03:00Z') },
    ])
    expect(s.streak).toBe(1)
    expect(s.todaySubCount).toBe(3)
  })
})

describe('rule: consecutive live days that hit the goal grow the streak', () => {
  it('reaches 3 over three live, hit days', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') },
      { kind: 'stream-online', at: at('2026-06-14T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-14T20:05:00Z') },
      { kind: 'stream-online', at: at('2026-06-15T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-15T20:05:00Z') },
    ])
    expect(s.streak).toBe(3)
    expect(s.longestStreak).toBe(3)
  })
})

describe('rule 3 → break: streamed but missed the goal', () => {
  it('resets the streak to 0 when the next day rolls over', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') }, // streak 1
      { kind: 'stream-online', at: at('2026-06-14T20:00:00Z') }, // live, no sub
      { kind: 'tick', at: at('2026-06-15T12:00:00Z') }, // launch next day → finalize the 14th
    ])
    expect(s.streak).toBe(0)
    expect(s.longestStreak).toBe(1)
  })

  it('finalizes a missed day lazily on app launch (tick)', () => {
    // Streamed the 13th, hit goal; app closed; reopened the 15th after streaming
    // nothing means the 13th still stands — only a *streamed* miss breaks it.
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') },
      { kind: 'tick', at: at('2026-06-15T09:00:00Z') },
    ])
    expect(s.streak).toBe(1) // off days are neutral, streak survives
  })
})

describe('rule: off days are neutral and preserve the streak', () => {
  it('keeps and grows the streak across a non-streaming gap', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') }, // streak 1
      // 14th: did not stream at all (no events)
      { kind: 'stream-online', at: at('2026-06-15T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-15T20:05:00Z') }, // streak 2
    ])
    expect(s.streak).toBe(2)
  })
})

describe('rollover hour: a stream past midnight stays one day', () => {
  it('counts a 2am sub toward the prior stream day with a 6am rollover', () => {
    const c = cfg({ dayRolloverHour: 6, dailyGoalTarget: 3 })
    const s = run(
      [
        { kind: 'stream-online', at: at('2026-06-13T23:00:00Z') },
        { kind: 'sub', at: at('2026-06-13T23:30:00Z') },
        { kind: 'sub', at: at('2026-06-14T01:00:00Z') }, // 1am next calendar day
        { kind: 'sub', at: at('2026-06-14T02:00:00Z') }, // still the same stream day
      ],
      c,
    )
    expect(s.currentDay).toBe('2026-06-13')
    expect(s.todaySubCount).toBe(3)
    expect(s.streak).toBe(1)
  })
})

describe('longestStreak is retained after a reset', () => {
  it('remembers the peak after the streak breaks', () => {
    const s = run([
      { kind: 'stream-online', at: at('2026-06-13T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-13T20:05:00Z') },
      { kind: 'stream-online', at: at('2026-06-14T20:00:00Z') },
      { kind: 'sub', at: at('2026-06-14T20:05:00Z') }, // streak 2
      { kind: 'stream-online', at: at('2026-06-15T20:00:00Z') }, // live, miss
      { kind: 'tick', at: at('2026-06-16T10:00:00Z') }, // finalize 15th → reset
    ])
    expect(s.streak).toBe(0)
    expect(s.longestStreak).toBe(2)
  })
})

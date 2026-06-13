import { useState } from 'react'
import { getDisplay } from '../lib/streak/engine'
import { isTwitchConfigured } from '../lib/twitch/constants'
import { useSubStreakStore } from '../state/useSubStreakStore'
import { useTwitchStore } from '../state/useTwitchStore'
import type { TwitchAuthActions } from '../hooks/useTwitchAuth'

const GOAL_PRESETS = [1, 2, 3, 5, 7, 10, 15, 20, 25, 50]

export function GoalView({ auth }: { auth: TwitchAuthActions }) {
  const { login, cancelLogin, logout } = auth
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const simulateSub = useSubStreakStore((s) => s.simulateSub)
  const goLive = useSubStreakStore((s) => s.goLive)
  const setTarget = useSubStreakStore((s) => s.setTarget)
  const setRolloverHour = useSubStreakStore((s) => s.setRolloverHour)
  const hardReset = useSubStreakStore((s) => s.hardReset)

  const twitchStatus = useTwitchStore((s) => s.status)
  const session = useTwitchStore((s) => s.session)
  const deviceFlow = useTwitchStore((s) => s.deviceFlow)
  const twitchError = useTwitchStore((s) => s.error)
  const eventSubConnected = useTwitchStore((s) => s.eventSubConnected)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const view = getDisplay(streak, config)
  const pct = Math.min(100, Math.round((view.rawCount / view.target) * 100))
  const remaining = Math.max(0, view.target - view.rawCount)
  const goalCaption = view.goalHitToday
    ? 'GOAL MET'
    : view.rawCount > 0
      ? `${remaining} MORE TO GO`
      : view.liveToday
        ? 'WAITING FOR SUBS'
        : 'OFFLINE'

  return (
    <>
      <div className="sectionhead">
        <h1>Daily sub goal</h1>
        <button
          className={`gear ${settingsOpen ? 'gear--on' : ''}`}
          aria-label="Settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
          </svg>
        </button>
      </div>

      <div className="stats">
        <section className={`stat ${view.goalHitToday ? 'stat--met' : ''}`}>
          <div className="stat__label">Today</div>
          <div className="stat__figure">
            <span className="stat__num">{Math.min(view.rawCount, view.target)}</span>
            <span className="stat__den">/{view.target}</span>
          </div>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="stat__cap">{goalCaption}</div>
        </section>

        <section className="stat">
          <div className="stat__label">Streak</div>
          <div className="stat__figure">
            <span className="stat__num">{view.streak}</span>
            <span className="stat__unit">{view.streak === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="stat__cap">Best {view.longestStreak}</div>
        </section>
      </div>

      {deviceFlow && twitchStatus === 'authorizing' ? (
        <section className="panel devicecode">
          <div className="devicecode__lead">Enter this code at</div>
          <a className="devicecode__link" href={deviceFlow.verificationUri} target="_blank" rel="noreferrer">
            {deviceFlow.verificationUri.replace(/^https?:\/\//, '')}
          </a>
          <div className="devicecode__code">{deviceFlow.userCode}</div>
          <button className="btn btn--ghost" onClick={cancelLogin}>Cancel</button>
        </section>
      ) : (
        <section className="panel rows">
          <div className="row">
            <span className="row__label">Twitch</span>
            <span className="row__value">
              {twitchStatus === 'connected' ? (
                <>
                  <span className="row__strong">{session?.login}</span>
                  <span className={`tag ${eventSubConnected ? 'tag--on' : ''}`}>
                    {eventSubConnected ? 'Listening' : 'Connecting'}
                  </span>
                </>
              ) : !isTwitchConfigured() ? (
                'Client ID not set'
              ) : twitchStatus === 'bootstrapping' || twitchStatus === 'refreshing' ? (
                'Working…'
              ) : (
                twitchError ?? 'Not connected'
              )}
            </span>
            <span className="row__action">
              {twitchStatus === 'connected' ? (
                <button className="btn btn--ghost" onClick={() => void logout()}>Sign out</button>
              ) : (
                <button className="btn" disabled={!isTwitchConfigured() || twitchStatus === 'bootstrapping'} onClick={() => void login()}>
                  Connect
                </button>
              )}
            </span>
          </div>

          <div className="row">
            <span className="row__label">Goal</span>
            <span className="row__value">
              <span className="select">
                <select value={config.dailyGoalTarget} onChange={(e) => setTarget(Number(e.target.value))}>
                  {(GOAL_PRESETS.includes(config.dailyGoalTarget) ? GOAL_PRESETS : [config.dailyGoalTarget, ...GOAL_PRESETS]).map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? 'sub' : 'subs'} / day</option>
                  ))}
                </select>
              </span>
            </span>
            <span className="row__action" />
          </div>
        </section>
      )}

      {settingsOpen && (
        <section className="panel rows">
          <div className="row">
            <span className="row__label">Day reset</span>
            <span className="row__value">
              <span className="select">
                <select value={config.dayRolloverHour} onChange={(e) => setRolloverHour(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h === 0 ? 'Midnight' : `${h}:00`}</option>
                  ))}
                </select>
              </span>
            </span>
            <span className="row__hint">new day starts</span>
          </div>
          <div className="row">
            <span className="row__label">Test</span>
            <span className="row__value test-actions">
              <button className="btn btn--ghost" onClick={() => goLive()}>Go live</button>
              <button className="btn btn--ghost" onClick={() => simulateSub(1)}>+1 sub</button>
              <button className="btn btn--ghost" onClick={() => simulateSub(5)}>+5 gift</button>
            </span>
            <span className="row__action">
              <button className="btn btn--danger" onClick={() => hardReset()}>Reset</button>
            </span>
          </div>
        </section>
      )}
    </>
  )
}

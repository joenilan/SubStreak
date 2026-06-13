import { useEffect, useState } from 'react'
import { getDisplay } from './lib/streak/engine'
import { useSubStreakStore } from './state/useSubStreakStore'

export function App() {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const tick = useSubStreakStore((s) => s.tick)
  const simulateSub = useSubStreakStore((s) => s.simulateSub)
  const goLive = useSubStreakStore((s) => s.goLive)
  const setTarget = useSubStreakStore((s) => s.setTarget)
  const setRolloverHour = useSubStreakStore((s) => s.setRolloverHour)
  const hardReset = useSubStreakStore((s) => s.hardReset)

  const [panelOpen, setPanelOpen] = useState(false)

  // Finalize on launch, then keep the day fresh on a slow interval.
  useEffect(() => {
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [tick])

  const view = getDisplay(streak, config)
  const pct = Math.min(100, Math.round((view.rawCount / view.target) * 100))

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark">▲</span>
          <span className="brand__name">SubStreak</span>
        </div>
        <span className={`live-dot ${view.liveToday ? 'live-dot--on' : ''}`}>
          {view.liveToday ? 'LIVE' : 'OFFLINE'}
        </span>
      </header>

      {/* Daily sub goal */}
      <section className={`card goal ${view.goalHitToday ? 'goal--hit' : ''}`}>
        <div className="card__label">Daily sub goal</div>
        <div className="goal__count">
          <span className="goal__current">{Math.min(view.rawCount, view.target)}</span>
          <span className="goal__divider">/</span>
          <span className="goal__target">{view.target}</span>
        </div>
        <div className="bar">
          <div className="bar__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="goal__status">
          {view.goalHitToday
            ? '✓ Goal hit today'
            : view.rawCount > view.target
              ? `${view.rawCount} subs today`
              : `${view.target - view.rawCount} to go`}
        </div>
      </section>

      {/* Daily streak */}
      <section className="card streak">
        <div className="card__label">Daily streak</div>
        <div className="streak__value">
          <span className="streak__flame">🔥</span>
          <span className="streak__days">{view.streak}</span>
          <span className="streak__unit">{view.streak === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="streak__best">Best: {view.longestStreak}</div>
      </section>

      <button className="panel-toggle" onClick={() => setPanelOpen((v) => !v)}>
        {panelOpen ? 'Hide controls' : 'Settings & test'}
      </button>

      {panelOpen && (
        <section className="card panel">
          <label className="field">
            <span className="field__label">Goal target (subs / day)</span>
            <input
              type="number"
              min={1}
              value={config.dailyGoalTarget}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span className="field__label">Day rollover hour (0–23)</span>
            <input
              type="number"
              min={0}
              max={23}
              value={config.dayRolloverHour}
              onChange={(e) => setRolloverHour(Number(e.target.value))}
            />
            <span className="field__hint">Set ~5–6 so post-midnight streams stay one day.</span>
          </label>

          <div className="panel__divider">Test (until Twitch is wired)</div>
          <div className="panel__actions">
            <button onClick={() => goLive()}>Go live</button>
            <button onClick={() => simulateSub(1)}>+1 sub</button>
            <button onClick={() => simulateSub(5)}>+5 (gift bomb)</button>
            <button className="danger" onClick={() => hardReset()}>
              Reset all
            </button>
          </div>
        </section>
      )}

      <footer className="app__footer">v{__APP_VERSION__} · runs in the tray</footer>
    </div>
  )
}

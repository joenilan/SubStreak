import { useEffect, useState } from 'react'
import { getDisplay } from './lib/streak/engine'
import { isTwitchConfigured } from './lib/twitch/constants'
import { useSubStreakStore } from './state/useSubStreakStore'
import { useTwitchStore } from './state/useTwitchStore'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { useEventSub } from './hooks/useEventSub'
import { useOverlaySync } from './hooks/useOverlaySync'

export function App() {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const tick = useSubStreakStore((s) => s.tick)
  const simulateSub = useSubStreakStore((s) => s.simulateSub)
  const goLive = useSubStreakStore((s) => s.goLive)
  const setTarget = useSubStreakStore((s) => s.setTarget)
  const setRolloverHour = useSubStreakStore((s) => s.setRolloverHour)
  const hardReset = useSubStreakStore((s) => s.hardReset)

  const { login, cancelLogin, logout } = useTwitchAuth()
  useEventSub()
  const { overlayUrl } = useOverlaySync()
  const twitchStatus = useTwitchStore((s) => s.status)
  const session = useTwitchStore((s) => s.session)
  const deviceFlow = useTwitchStore((s) => s.deviceFlow)
  const twitchError = useTwitchStore((s) => s.error)
  const eventSubConnected = useTwitchStore((s) => s.eventSubConnected)

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

      {/* Twitch connection */}
      <TwitchConnection
        status={twitchStatus}
        login={session?.login ?? null}
        deviceFlow={deviceFlow}
        error={twitchError}
        eventSubConnected={eventSubConnected}
        onLogin={() => void login()}
        onCancel={cancelLogin}
        onLogout={() => void logout()}
      />

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

      {overlayUrl && <OverlayCard url={overlayUrl} />}

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

          <div className="panel__divider">Test (simulate events)</div>
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

function OverlayCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <section className="card overlay-card">
      <div className="card__label">OBS overlay</div>
      <div className="overlay-card__row">
        <code className="overlay-card__url">{url}</code>
        <button className="overlay-card__copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="field__hint">Add a Browser source in OBS with this URL.</div>
    </section>
  )
}

interface TwitchConnectionProps {
  status: string
  login: string | null
  deviceFlow: { userCode: string; verificationUri: string } | null
  error: string | null
  eventSubConnected: boolean
  onLogin: () => void
  onCancel: () => void
  onLogout: () => void
}

function TwitchConnection({
  status,
  login,
  deviceFlow,
  error,
  eventSubConnected,
  onLogin,
  onCancel,
  onLogout,
}: TwitchConnectionProps) {
  if (!isTwitchConfigured()) {
    return (
      <section className="card twitch">
        <div className="card__label">Twitch</div>
        <div className="twitch__msg">Set VITE_TWITCH_CLIENT_ID in .env to enable login.</div>
      </section>
    )
  }

  if (status === 'authorizing' && deviceFlow) {
    return (
      <section className="card twitch">
        <div className="card__label">Connect Twitch</div>
        <div className="twitch__msg">
          Go to{' '}
          <a href={deviceFlow.verificationUri} target="_blank" rel="noreferrer">
            {deviceFlow.verificationUri.replace(/^https?:\/\//, '')}
          </a>{' '}
          and enter:
        </div>
        <div className="twitch__code">{deviceFlow.userCode}</div>
        <button className="twitch__btn" onClick={onCancel}>
          Cancel
        </button>
      </section>
    )
  }

  if (status === 'connected') {
    return (
      <section className="card twitch twitch--ok">
        <div className="card__label">Twitch</div>
        <div className="twitch__row">
          <span>
            Connected as <strong>{login}</strong>
          </span>
          <span className={`live-dot ${eventSubConnected ? 'live-dot--on' : ''}`}>
            {eventSubConnected ? 'EVENTSUB' : 'CONNECTING'}
          </span>
        </div>
        <button className="twitch__btn twitch__btn--ghost" onClick={onLogout}>
          Sign out
        </button>
      </section>
    )
  }

  const busy = status === 'bootstrapping' || status === 'refreshing'
  return (
    <section className="card twitch">
      <div className="card__label">Twitch</div>
      {error && <div className="twitch__msg twitch__msg--error">{error}</div>}
      <button className="twitch__btn" disabled={busy} onClick={onLogin}>
        {busy ? 'Working…' : 'Connect Twitch'}
      </button>
    </section>
  )
}

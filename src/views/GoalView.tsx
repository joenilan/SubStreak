import { useEffect, useState } from 'react'
import { Check, Clipboard, ExternalLink, Settings } from 'lucide-react'
import { getDisplay } from '../lib/streak/engine'
import { isTwitchConfigured } from '../lib/twitch/constants'
import { copyText, openExternal } from '../lib/platform/open'
import { Modal } from '../components/Modal'
import { useSubStreakStore } from '../state/useSubStreakStore'
import { useTwitchStore } from '../state/useTwitchStore'
import type { TwitchAuthActions } from '../hooks/useTwitchAuth'

export function GoalView({ auth, onOpenSettings }: { auth: TwitchAuthActions; onOpenSettings: () => void }) {
  const { login, cancelLogin, logout } = auth
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const setTarget = useSubStreakStore((s) => s.setTarget)

  const basis = config.streakBasis ?? 'day'

  const twitchStatus = useTwitchStore((s) => s.status)
  const session = useTwitchStore((s) => s.session)
  const deviceFlow = useTwitchStore((s) => s.deviceFlow)
  const twitchError = useTwitchStore((s) => s.error)
  const eventSubConnected = useTwitchStore((s) => s.eventSubConnected)

  const [goalDraft, setGoalDraft] = useState(() => String(config.dailyGoalTarget))

  useEffect(() => {
    setGoalDraft(String(config.dailyGoalTarget))
  }, [config.dailyGoalTarget])

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

  const twitchValue =
    twitchStatus === 'connected' ? null
    : !isTwitchConfigured() ? 'Client ID not set'
    : twitchStatus === 'authorizing' ? 'Authorizing…'
    : twitchStatus === 'bootstrapping' || twitchStatus === 'refreshing' ? 'Working…'
    : twitchError ?? 'Not connected'

  return (
    <>
      <div className="sectionhead">
        <h1>{basis === 'stream' ? 'Stream sub goal' : 'Daily sub goal'}</h1>
        <button className="gear" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
          <Settings size={17} />
        </button>
      </div>

      <div className="stats">
        <section className={`stat ${view.goalHitToday ? 'stat--met' : ''}`}>
          <div className="stat__label">{basis === 'stream' ? 'This stream' : 'Today'}</div>
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
            <span className="stat__unit">
              {basis === 'stream'
                ? view.streak === 1 ? 'stream' : 'streams'
                : view.streak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="stat__cap">Best {view.longestStreak}</div>
        </section>
      </div>

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
            ) : (
              twitchValue
            )}
          </span>
          <span className="row__action">
            {twitchStatus === 'connected' ? (
              <button className="btn btn--ghost" onClick={() => void logout()}>Sign out</button>
            ) : (
              <button
                className="btn"
                disabled={!isTwitchConfigured() || twitchStatus === 'bootstrapping' || twitchStatus === 'authorizing'}
                onClick={() => void login()}
              >
                Connect
              </button>
            )}
          </span>
        </div>

        <div className="row">
          <span className="row__label">Goal</span>
          <span className="row__value">
            <input
              className="number-input number-input--goal"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={goalDraft}
              aria-label="Daily sub goal"
              onChange={(e) => {
                const next = e.target.value
                if (!/^\d*$/.test(next)) return
                setGoalDraft(next)
                if (next) setTarget(Number(next))
              }}
              onBlur={() => {
                if (!goalDraft || Number(goalDraft) < 1) setGoalDraft(String(config.dailyGoalTarget))
              }}
            />
            <span className="row__hint">{config.dailyGoalTarget === 1 ? 'sub' : 'subs'} / {basis === 'stream' ? 'stream' : 'day'}</span>
          </span>
          <span className="row__action" />
        </div>
      </section>

      {deviceFlow && twitchStatus === 'authorizing' && (
        <Modal title="Connect Twitch" onClose={cancelLogin}>
          <p className="modal__text">
            Open Twitch, sign in, then enter this code to link your channel.
          </p>
          <button className="btn btn--full" onClick={() => void openExternal(deviceFlow.verificationUri)}>
            <ExternalLink size={15} />
            Open {deviceFlow.verificationUri.replace(/^https?:\/\/(www\.)?/, '')}
          </button>
          <CodeChip code={deviceFlow.userCode} />
          <p className="modal__wait">Waiting for you to authorize…</p>
        </Modal>
      )}
    </>
  )
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <button className="codechip" onClick={() => void onCopy()} title="Click to copy">
      <span className="codechip__code">{code}</span>
      <span className="codechip__hint">
        {copied ? <Check size={14} /> : <Clipboard size={14} />}
        {copied ? 'Copied' : 'Click to copy'}
      </span>
    </button>
  )
}

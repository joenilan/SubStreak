import { useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useSubStreakStore } from '../state/useSubStreakStore'

function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const config = useSubStreakStore((s) => s.config)
  const setStreakBasis = useSubStreakStore((s) => s.setStreakBasis)
  const setRolloverHour = useSubStreakStore((s) => s.setRolloverHour)
  const setReconnectGrace = useSubStreakStore((s) => s.setReconnectGrace)
  const setCelebrateSound = useSubStreakStore((s) => s.setCelebrateSound)
  const setNudgeAtRisk = useSubStreakStore((s) => s.setNudgeAtRisk)
  const simulateSub = useSubStreakStore((s) => s.simulateSub)
  const goLive = useSubStreakStore((s) => s.goLive)
  const goOffline = useSubStreakStore((s) => s.goOffline)
  const hardReset = useSubStreakStore((s) => s.hardReset)

  const basis = config.streakBasis ?? 'day'

  // Fit the window to the settings content so there's no dead space below it.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isNativeRuntime()) return
    let cancelled = false
    const id = window.setTimeout(() => {
      void (async () => {
        const el = rootRef.current
        if (!el) return
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
        const w = getCurrentWindow()
        if (cancelled || (await w.isMaximized())) return
        const titlebar = document.querySelector('.titlebar') as HTMLElement | null
        const footer = document.querySelector('.statusbar') as HTMLElement | null
        const chrome = (titlebar?.offsetHeight ?? 38) + (footer?.offsetHeight ?? 30) + 40 // .content padding
        const maxH = Math.max(360, window.screen.availHeight - 56)
        const h = Math.min(Math.ceil(el.offsetHeight + chrome + 4), maxH)
        await w.setSize(new LogicalSize(560, h))
      })()
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [basis])

  return (
    <div className="settingsview" ref={rootRef}>
      <div className="sectionhead">
        <button className="backbtn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <h1>Settings</h1>
      </div>

      <section className="panel">
        <div className="field-group">
          <label className="field-group__label">Streak counts per</label>
          <div className="seg seg--full">
            <button className={basis === 'stream' ? 'on' : ''} onClick={() => setStreakBasis('stream')}>Stream</button>
            <button className={basis === 'day' ? 'on' : ''} onClick={() => setStreakBasis('day')}>Day</button>
          </div>
          <p className="modal__hint">
            {basis === 'stream'
              ? 'Each stream is one goal attempt — hit goal to extend your streak, end a stream under goal to reset it. Off days never count against you.'
              : 'One streak step per streamed day. Days you don’t go live are neutral; a streamed day that misses the goal breaks it.'}
          </p>
        </div>

        {basis === 'day' ? (
          <div className="field-group">
            <label className="field-group__label">New day at</label>
            <span className="select select--full">
              <select value={config.dayRolloverHour} onChange={(e) => setRolloverHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{h === 0 ? 'Midnight' : `${h}:00`}</option>
                ))}
              </select>
            </span>
            <p className="modal__hint">
              When a new day starts — today resets to 0 and a fresh streak day begins.
              Set it after midnight if you stream past 12am, so a late session counts as one day.
            </p>
          </div>
        ) : (
          <div className="field-group">
            <label className="field-group__label">Reconnect grace</label>
            <span className="row__value">
              <input
                className="number-input"
                type="number"
                min={0}
                max={120}
                step={1}
                value={config.reconnectGraceMinutes ?? 10}
                onChange={(e) => setReconnectGrace(Number(e.target.value))}
              />
              <span className="row__hint">minutes</span>
            </span>
            <p className="modal__hint">
              If you go offline and come back within this window (a drop or restart), it stays the same stream and your sub count carries over.
            </p>
          </div>
        )}

        <div className="field-group">
          <label className="field-group__label">Celebrations</label>
          <label className="toggle">
            <input type="checkbox" checked={config.celebrateSound ?? true} onChange={(e) => setCelebrateSound(e.target.checked)} />
            <span>Play a sound when the goal is hit</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={config.nudgeAtRisk ?? true} onChange={(e) => setNudgeAtRisk(e.target.checked)} />
            <span>Remind me if I’m live without hitting goal</span>
          </label>
        </div>

        <div className="field-group">
          <label className="field-group__label">Test events</label>
          <div className="btn-group">
            <button className="btn btn--ghost" onClick={() => goLive()}>Go live</button>
            <button className="btn btn--ghost" onClick={() => goOffline()}>Go offline</button>
            <button className="btn btn--ghost" onClick={() => simulateSub(1)}>+1 sub</button>
            <button className="btn btn--ghost" onClick={() => simulateSub(5)}>+5 gift</button>
          </div>
        </div>

        <button className="btn btn--danger btn--full" onClick={() => hardReset()}>
          Reset all progress
        </button>
      </section>
    </div>
  )
}

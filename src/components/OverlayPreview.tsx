import { renderTemplate, type OverlaySettings } from '../lib/overlay/types'

export interface OverlayData {
  current: number
  target: number
  remaining: number
  pct: number
  streak: number
  best: number
  goalHit: boolean
  live: boolean
}

/**
 * Presentational overlay content (widget or custom text), rendered at real px.
 * The caller positions/scales it. Kept visually in sync with src-tauri/src/overlay.html.
 */
export function OverlayPreview({ settings, data }: { settings: OverlaySettings; data: OverlayData }) {
  if (settings.mode === 'text') {
    return (
      <div
        className="ovp-text"
        style={{
          fontSize: settings.text.fontSize,
          color: settings.text.color,
          textAlign: settings.text.align,
        }}
      >
        {renderTemplate(settings.text.template, data)}
      </div>
    )
  }

  const cap = data.goalHit
    ? 'Goal met'
    : data.current > 0
      ? `${data.remaining} more to go`
      : data.live
        ? 'Waiting for subs'
        : 'Offline'

  return (
    <div className={`ovp-widget ${data.goalHit ? 'ovp-met' : ''}`}>
      <div className="ovp-cell">
        <div className="ovp-label">Daily goal</div>
        <div className="ovp-figure">
          <span className="ovp-num">{data.current}</span>
          <span className="ovp-den">/{data.target}</span>
        </div>
        <div className="ovp-bar">
          <div className="ovp-fill" style={{ width: `${data.pct}%` }} />
        </div>
        <div className="ovp-cap">{cap}</div>
      </div>
      <div className="ovp-sep" />
      <div className="ovp-cell ovp-streak">
        <div className="ovp-label">Streak</div>
        <div className="ovp-figure" style={{ justifyContent: 'center' }}>
          <span className="ovp-num">{data.streak}</span>
          <span className="ovp-unit">{data.streak === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="ovp-cap">Best {data.best}</div>
      </div>
    </div>
  )
}

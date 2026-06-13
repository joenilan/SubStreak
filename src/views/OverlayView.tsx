import { useEffect, useRef, useState } from 'react'
import { getDisplay } from '../lib/streak/engine'
import { clamp, OVERLAY_TOKENS } from '../lib/overlay/types'
import { OverlayPreview, type OverlayData } from '../components/OverlayPreview'
import { useSubStreakStore } from '../state/useSubStreakStore'

const CANVAS_REF_WIDTH = 1920 // overlay coords are relative to a 1080p canvas

export function OverlayView({ overlayUrl }: { overlayUrl: string }) {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const overlay = useSubStreakStore((s) => s.overlay)
  const setOverlay = useSubStreakStore((s) => s.setOverlay)
  const setOverlayText = useSubStreakStore((s) => s.setOverlayText)
  const resetOverlay = useSubStreakStore((s) => s.resetOverlay)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const dragging = useRef(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasWidth(el.clientWidth))
    ro.observe(el)
    setCanvasWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const view = getDisplay(streak, config)
  const data: OverlayData = {
    current: Math.min(view.rawCount, view.target),
    target: view.target,
    remaining: Math.max(0, view.target - view.rawCount),
    pct: Math.min(100, Math.round((view.rawCount / view.target) * 100)),
    streak: view.streak,
    best: view.longestStreak,
    goalHit: view.goalHitToday,
    live: view.liveToday,
  }

  const factor = canvasWidth > 0 ? canvasWidth / CANVAS_REF_WIDTH : 0.3

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !canvasRef.current) return
    const r = canvasRef.current.getBoundingClientRect()
    setOverlay({
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100),
    })
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div className="overlayview">
      <div className="sectionhead">
        <h1>Overlay</h1>
        <button className="btn btn--ghost" onClick={resetOverlay}>Reset</button>
      </div>

      <div className="ovcanvas" ref={canvasRef}>
        <div className="ovcanvas__grid" />
        <div
          className="ovstage"
          style={{
            left: `${overlay.x}%`,
            top: `${overlay.y}%`,
            transform: `translate(-50%, -50%) scale(${factor * (overlay.scale / 100)})`,
            opacity: overlay.opacity / 100,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <OverlayPreview settings={overlay} data={data} />
        </div>
        <span className="ovcanvas__hint">Drag to position</span>
      </div>

      <section className="panel rows">
        <div className="row">
          <span className="row__label">Style</span>
          <span className="row__value">
            <div className="seg">
              <button className={overlay.mode === 'widget' ? 'on' : ''} onClick={() => setOverlay({ mode: 'widget' })}>Widget</button>
              <button className={overlay.mode === 'text' ? 'on' : ''} onClick={() => setOverlay({ mode: 'text' })}>Text</button>
            </div>
          </span>
          <span className="row__action" />
        </div>
        <div className="row">
          <span className="row__label">Scale</span>
          <span className="row__value">
            <input className="slider" type="range" min={50} max={200} value={overlay.scale}
              onChange={(e) => setOverlay({ scale: Number(e.target.value) })} />
          </span>
          <span className="row__hint">{overlay.scale}%</span>
        </div>
        <div className="row">
          <span className="row__label">Opacity</span>
          <span className="row__value">
            <input className="slider" type="range" min={0} max={100} value={overlay.opacity}
              onChange={(e) => setOverlay({ opacity: Number(e.target.value) })} />
          </span>
          <span className="row__hint">{overlay.opacity}%</span>
        </div>
      </section>

      {overlay.mode === 'text' && (
        <section className="panel rows">
          <div className="row row--stack">
            <span className="row__label">Text</span>
            <input className="textinput" type="text" value={overlay.text.template}
              onChange={(e) => setOverlayText({ template: e.target.value })} />
          </div>
          <div className="row tokens">
            <span className="row__label" />
            <span className="row__value token-list">
              {OVERLAY_TOKENS.map((t) => (
                <button key={t} className="token" onClick={() => setOverlayText({ template: overlay.text.template + ' ' + t })}>{t}</button>
              ))}
            </span>
          </div>
          <div className="row">
            <span className="row__label">Size</span>
            <span className="row__value">
              <input className="slider" type="range" min={16} max={96} value={overlay.text.fontSize}
                onChange={(e) => setOverlayText({ fontSize: Number(e.target.value) })} />
            </span>
            <span className="row__hint">{overlay.text.fontSize}px</span>
          </div>
          <div className="row">
            <span className="row__label">Color</span>
            <span className="row__value">
              <input className="color" type="color" value={overlay.text.color}
                onChange={(e) => setOverlayText({ color: e.target.value })} />
            </span>
            <span className="row__action">
              <div className="seg">
                <button className={overlay.text.align === 'left' ? 'on' : ''} onClick={() => setOverlayText({ align: 'left' })}>L</button>
                <button className={overlay.text.align === 'center' ? 'on' : ''} onClick={() => setOverlayText({ align: 'center' })}>C</button>
                <button className={overlay.text.align === 'right' ? 'on' : ''} onClick={() => setOverlayText({ align: 'right' })}>R</button>
              </div>
            </span>
          </div>
        </section>
      )}

      {overlayUrl && (
        <section className="panel rows">
          <div className="row">
            <span className="row__label">Browser source</span>
            <span className="row__value"><code className="url">{overlayUrl}</code></span>
            <span className="row__action"><CopyButton text={overlayUrl} /></span>
          </div>
        </section>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button className="btn btn--ghost" onClick={() =>
      void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400) })
    }>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Copy, ExternalLink, Eye, EyeOff, Plus, RotateCcw, Trash2,
} from 'lucide-react'
import { getDisplay } from '../lib/streak/engine'
import { clamp, OVERLAY_TOKENS, RESOLUTION_PRESETS, type OverlayElement } from '../lib/overlay/types'
import { OverlayPreview, type OverlayData } from '../components/OverlayPreview'
import { CopyButton } from '../components/CopyButton'
import { openExternal } from '../lib/platform/open'
import { useSubStreakStore } from '../state/useSubStreakStore'

interface OverlayViewProps {
  overlayUrl: string
  previewUrl: string
  lanUrl: string | null
  lanAccessEnabled: boolean
}

const ELEMENT_NAME: Record<OverlayElement['kind'], string> = {
  dailyGoal: 'Daily goal',
  streak: 'Streak',
  text: 'Text',
}

type DragTarget = { kind: 'group' } | { kind: 'element'; id: string }
type SnapMode = 'off' | 'grid' | 'guides'

const SNAP_KEY = 'substreak.overlay.snap'
const GUIDE_THRESHOLD = 2.5 // percent
const COMMON_LINES = [50, 33.333, 66.667] // center + thirds
// 3×3 quick-position grid (% of canvas, with an edge margin so items stay visible).
const EDGE = 8
const POS_AXIS = [EDGE, 50, 100 - EDGE]

export function OverlayView({ overlayUrl, previewUrl, lanUrl, lanAccessEnabled }: OverlayViewProps) {
  const config = useSubStreakStore((s) => s.config)
  const streak = useSubStreakStore((s) => s.streak)
  const overlay = useSubStreakStore((s) => s.overlay)
  const setOverlay = useSubStreakStore((s) => s.setOverlay)
  const setOverlayGroup = useSubStreakStore((s) => s.setOverlayGroup)
  const setElement = useSubStreakStore((s) => s.setElement)
  const toggleGroup = useSubStreakStore((s) => s.toggleGroup)
  const addTextElement = useSubStreakStore((s) => s.addTextElement)
  const duplicateElement = useSubStreakStore((s) => s.duplicateElement)
  const removeElement = useSubStreakStore((s) => s.removeElement)
  const resetOverlay = useSubStreakStore((s) => s.resetOverlay)

  const resolution = overlay.resolution ?? { width: 1920, height: 1080 }
  const group = overlay.group

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const drag = useRef<DragTarget | null>(null)

  const [selectedId, setSelectedId] = useState<string>(overlay.elements[0]?.id ?? 'dailyGoal')
  const selected = overlay.elements.find((el) => el.id === selectedId) ?? overlay.elements[0]

  // Snap mode is an editor preference (not overlay output), persisted locally.
  const [snapMode, setSnapMode] = useState<SnapMode>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SNAP_KEY) : null
    return v === 'grid' || v === 'guides' ? v : 'off'
  })
  useEffect(() => {
    try {
      localStorage.setItem(SNAP_KEY, snapMode)
    } catch {
      /* ignore */
    }
  }, [snapMode])
  const snapStep = 5 // percent
  // Active alignment guide lines drawn during a magnetic drag.
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })

  // The thing the position tools act on: the whole group, or the selected item.
  const activePos = group.grouped ? { x: group.x, y: group.y } : selected ? { x: selected.x, y: selected.y } : null
  const applyPos = (patch: { x?: number; y?: number }) => {
    if (group.grouped) setOverlayGroup(patch)
    else if (selected) setElement(selected.id, patch)
  }
  const nudge = (dx: number, dy: number) => {
    if (!activePos) return
    applyPos({ x: clamp(activePos.x + dx, 0, 100), y: clamp(activePos.y + dy, 0, 100) })
  }
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      nudge(move[0], move[1])
    }
  }

  // Fit a canvas of the chosen resolution's aspect ratio inside the available space.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ar = resolution.width > 0 && resolution.height > 0 ? resolution.width / resolution.height : 16 / 9
    const fit = () => {
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      if (W === 0 || H === 0) return
      let w = W
      let h = W / ar
      if (h > H) {
        h = H
        w = H * ar
      }
      setCanvasSize({ w: Math.floor(w), h: Math.floor(h) })
    }
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    fit()
    return () => ro.disconnect()
  }, [resolution.width, resolution.height])

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

  const factor = resolution.width > 0 && canvasSize.w > 0 ? canvasSize.w / resolution.width : 0.3

  const isPreset = RESOLUTION_PRESETS.some((p) => p.width === resolution.width && p.height === resolution.height)
  const [showCustomRes, setShowCustomRes] = useState(!isPreset)

  // Snap a value to the grid (grid mode) or to a nearby alignment line (guides).
  const gridSnap = (v: number) => clamp(Math.round(v / snapStep) * snapStep, 0, 100)
  const lineSnap = (v: number, lines: number[]) => {
    let best: number | null = null
    let bestDist = GUIDE_THRESHOLD
    for (const t of lines) {
      const d = Math.abs(v - t)
      if (d <= bestDist) {
        best = t
        bestDist = d
      }
    }
    return best
  }

  // Drag: move the group (grouped) or the selected element (independent).
  const posFromEvent = (e: React.PointerEvent, target: DragTarget) => {
    const r = canvasRef.current!.getBoundingClientRect()
    let x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)
    let y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)
    if (snapMode === 'grid') {
      x = gridSnap(x)
      y = gridSnap(y)
    } else if (snapMode === 'guides') {
      // Align to canvas center/thirds, plus the other items' centers.
      const xLines = [...COMMON_LINES]
      const yLines = [...COMMON_LINES]
      if (target.kind === 'element') {
        for (const el of overlay.elements) {
          if (el.id !== target.id && el.visible) {
            xLines.push(el.x)
            yLines.push(el.y)
          }
        }
      }
      const gx = lineSnap(x, xLines)
      const gy = lineSnap(y, yLines)
      if (gx !== null) x = gx
      if (gy !== null) y = gy
      setGuides({ x: gx, y: gy })
    }
    return { x, y }
  }
  const beginDrag = (target: DragTarget, e: React.PointerEvent) => {
    drag.current = target
    canvasRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onGroupPointerDown = (e: React.PointerEvent) => beginDrag({ kind: 'group' }, e)
  const onElementPointerDown = (id: string, e: React.PointerEvent) => {
    setSelectedId(id)
    beginDrag({ kind: 'element', id }, e)
  }
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !canvasRef.current) return
    const pos = posFromEvent(e, drag.current)
    if (drag.current.kind === 'group') setOverlayGroup(pos)
    else setElement(drag.current.id, pos)
  }
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null
    setGuides({ x: null, y: null })
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="overlayview">
      <div className="sectionhead">
        <h1>Overlay</h1>
        <button className="btn btn--ghost" onClick={resetOverlay}>Reset</button>
      </div>

      <div className="ovcanvas-wrap" ref={wrapRef}>
        <div
          className={`ovcanvas ${snapMode === 'grid' ? 'snap' : ''}`}
          ref={canvasRef}
          tabIndex={0}
          style={{ width: canvasSize.w || undefined, height: canvasSize.h || undefined }}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onCanvasKeyDown}
        >
          <div className="ovcanvas__grid" />
          <div style={{ opacity: overlay.opacity / 100, position: 'absolute', inset: 0 }}>
            <OverlayPreview
              settings={overlay}
              data={data}
              factor={factor}
              interactive
              selectedId={selectedId}
              groupSelected={group.grouped}
              onGroupPointerDown={onGroupPointerDown}
              onElementPointerDown={onElementPointerDown}
            />
          </div>
          {guides.x !== null && <div className="ovguide ovguide--v" style={{ left: `${guides.x}%` }} />}
          {guides.y !== null && <div className="ovguide ovguide--h" style={{ top: `${guides.y}%` }} />}
          <span className="ovcanvas__hint">{group.grouped ? 'Drag the block to position' : 'Drag an item to position'}</span>
        </div>
      </div>

      <section className="panel rows">
        <div className="row">
          <span className="row__label">Align</span>
          <span className="row__value">
            <div className="btnrow">
              <button className="btn btn--ghost btn--sm" onClick={() => applyPos({ x: 50 })}>Center H</button>
              <button className="btn btn--ghost btn--sm" onClick={() => applyPos({ y: 50 })}>Center V</button>
              <button className="btn btn--ghost btn--sm" onClick={() => applyPos({ x: 50, y: 50 })}>Center</button>
            </div>
          </span>
          <span className="row__hint">{group.grouped ? 'whole block' : selected ? ELEMENT_NAME[selected.kind] : ''}</span>
        </div>
        <div className="row">
          <span className="row__label">Place</span>
          <span className="row__value ovtools">
            <div className="posgrid" role="group" aria-label="Quick position">
              {POS_AXIS.map((py) =>
                POS_AXIS.map((px) => (
                  <button
                    key={`${px}-${py}`}
                    className="posgrid__cell"
                    title={`Move to ${px === 50 ? 'center' : px < 50 ? 'left' : 'right'} / ${py === 50 ? 'middle' : py < 50 ? 'top' : 'bottom'}`}
                    onClick={() => applyPos({ x: px, y: py })}
                  >
                    <span />
                  </button>
                )),
              )}
            </div>
            <div className="dpad" role="group" aria-label="Nudge">
              <button className="dpad__btn dpad__up" title="Nudge up" onClick={() => nudge(0, -1)}><ChevronUp size={14} /></button>
              <button className="dpad__btn dpad__left" title="Nudge left" onClick={() => nudge(-1, 0)}><ChevronLeft size={14} /></button>
              <button className="dpad__btn dpad__right" title="Nudge right" onClick={() => nudge(1, 0)}><ChevronRight size={14} /></button>
              <button className="dpad__btn dpad__down" title="Nudge down" onClick={() => nudge(0, 1)}><ChevronDown size={14} /></button>
            </div>
          </span>
          <span className="row__hint">presets · 1% nudge</span>
        </div>
        <div className="row">
          <span className="row__label">Snap</span>
          <span className="row__value">
            <div className="seg">
              <button className={snapMode === 'off' ? 'on' : ''} onClick={() => setSnapMode('off')}>Off</button>
              <button className={snapMode === 'grid' ? 'on' : ''} onClick={() => setSnapMode('grid')}>Grid</button>
              <button className={snapMode === 'guides' ? 'on' : ''} onClick={() => setSnapMode('guides')}>Guides</button>
            </div>
          </span>
          <span className="row__hint">
            {snapMode === 'grid' ? `${snapStep}% grid` : snapMode === 'guides' ? 'magnetic align' : 'arrow keys nudge'}
          </span>
        </div>
      </section>

      <section className="panel rows">
        <div className="row">
          <span className="row__label">Layout</span>
          <span className="row__value">
            <div className="seg">
              <button className={group.grouped ? 'on' : ''} onClick={() => toggleGroup(true)}>Grouped</button>
              <button className={!group.grouped ? 'on' : ''} onClick={() => toggleGroup(false)}>Independent</button>
            </div>
          </span>
          <span className="row__hint">{group.grouped ? 'stack together' : 'drag each freely'}</span>
        </div>
        <div className="row">
          <span className="row__label">Canvas</span>
          <span className="row__value">
            <span className="select select--full">
              <select
                value={isPreset && !showCustomRes ? `${resolution.width}x${resolution.height}` : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setShowCustomRes(true)
                    return
                  }
                  const [w, h] = e.target.value.split('x').map(Number)
                  setShowCustomRes(false)
                  setOverlay({ resolution: { width: w, height: h } })
                }}
              >
                {RESOLUTION_PRESETS.map((p) => (
                  <option key={p.label} value={`${p.width}x${p.height}`}>{p.label}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </span>
          </span>
          <span className="row__hint">match OBS</span>
        </div>
        {showCustomRes && (
          <div className="row">
            <span className="row__label" />
            <span className="row__value res-custom">
              <input type="number" min={160} max={7680} value={resolution.width || ''}
                onChange={(e) => setOverlay({ resolution: { width: Math.max(0, Math.round(Number(e.target.value) || 0)), height: resolution.height } })} />
              <span className="res-custom__x">×</span>
              <input type="number" min={160} max={4320} value={resolution.height || ''}
                onChange={(e) => setOverlay({ resolution: { width: resolution.width, height: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} />
            </span>
            <span className="row__action" />
          </div>
        )}
        <div className="row">
          <span className="row__label">Dual PC</span>
          <span className="row__value">
            <label className="toggle">
              <input
                type="checkbox"
                checked={overlay.lanAccessEnabled}
                onChange={(e) => setOverlay({ lanAccessEnabled: e.target.checked })}
              />
              <span>Expose LAN browser-source URL</span>
            </label>
          </span>
          <span className="row__hint">
            {overlay.lanAccessEnabled ? (lanUrl ? 'LAN ready' : 'LAN unavailable') : 'local only'}
          </span>
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

      {group.grouped ? (
        <section className="panel rows">
          <div className="row">
            <span className="row__label">Direction</span>
            <span className="row__value">
              <div className="seg">
                <button className={group.direction === 'vertical' ? 'on' : ''} onClick={() => setOverlayGroup({ direction: 'vertical' })}>Stacked</button>
                <button className={group.direction === 'horizontal' ? 'on' : ''} onClick={() => setOverlayGroup({ direction: 'horizontal' })}>Inline</button>
              </div>
            </span>
            <span className="row__action" />
          </div>
          <div className="row">
            <span className="row__label">Justify</span>
            <span className="row__value">
              <div className="seg">
                <button className={group.align === 'left' ? 'on' : ''} onClick={() => setOverlayGroup({ align: 'left' })}>L</button>
                <button className={group.align === 'center' ? 'on' : ''} onClick={() => setOverlayGroup({ align: 'center' })}>C</button>
                <button className={group.align === 'right' ? 'on' : ''} onClick={() => setOverlayGroup({ align: 'right' })}>R</button>
              </div>
            </span>
            <span className="row__action" />
          </div>
          <div className="row">
            <span className="row__label">Gap</span>
            <span className="row__value">
              <input className="slider" type="range" min={0} max={120} value={group.gap}
                onChange={(e) => setOverlayGroup({ gap: Number(e.target.value) })} />
            </span>
            <span className="row__hint">{group.gap}px</span>
          </div>
          <TransformRows
            x={group.x} y={group.y} scale={group.scale} rotation={group.rotation}
            onChange={(patch) => setOverlayGroup(patch)}
          />
        </section>
      ) : (
        selected && (
          <section className="panel rows">
            <div className="row">
              <span className="row__label">Editing</span>
              <span className="row__value"><strong>{ELEMENT_NAME[selected.kind]}</strong></span>
              <span className="row__hint">drag on canvas too</span>
            </div>
            <TransformRows
              x={selected.x} y={selected.y} scale={selected.scale} rotation={selected.rotation}
              onChange={(patch) => setElement(selected.id, patch)}
            />
          </section>
        )
      )}

      <section className="panel rows">
        <div className="row">
          <span className="row__label">Items</span>
          <span className="row__value" />
          <span className="row__action">
            <button className="btn btn--ghost btn--sm" onClick={addTextElement}><Plus size={14} /> Text</button>
          </span>
        </div>
        {overlay.elements.map((el) => (
          <div key={el.id} className={`ov-elrow ${selectedId === el.id ? 'on' : ''}`}>
            <button
              className="iconbtn"
              title={el.visible ? 'Hide' : 'Show'}
              onClick={() => setElement(el.id, { visible: !el.visible })}
            >
              {el.visible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button className="ov-elname" onClick={() => setSelectedId(el.id)}>
              {ELEMENT_NAME[el.kind]}
              <span className="ov-elpreview">{el.template}</span>
            </button>
            {el.kind === 'text' && (
              <>
                <button className="iconbtn" title="Duplicate" onClick={() => duplicateElement(el.id)}><Copy size={14} /></button>
                <button className="iconbtn" title="Remove" onClick={() => removeElement(el.id)}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        ))}
      </section>

      {selected && (
        <section className="panel rows">
          <div className="row row--stack">
            <span className="row__label">{ELEMENT_NAME[selected.kind]} text</span>
            <input className="textinput" type="text" value={selected.template}
              onChange={(e) => setElement(selected.id, { template: e.target.value })} />
          </div>
          <div className="row tokens">
            <span className="row__label" />
            <span className="row__value token-list">
              {OVERLAY_TOKENS.map((t) => (
                <button key={t} className="token" onClick={() => setElement(selected.id, { template: `${selected.template} ${t}` })}>{t}</button>
              ))}
            </span>
          </div>
          <div className="row">
            <span className="row__label">Size</span>
            <span className="row__value">
              <input className="slider" type="range" min={16} max={120} value={selected.fontSize}
                onChange={(e) => setElement(selected.id, { fontSize: Number(e.target.value) })} />
            </span>
            <span className="row__hint">{selected.fontSize}px</span>
          </div>
          <div className="row">
            <span className="row__label">Color</span>
            <span className="row__value">
              <input className="color" type="color" value={selected.color}
                onChange={(e) => setElement(selected.id, { color: e.target.value })} />
            </span>
            <span className="row__action" />
          </div>
        </section>
      )}

      {overlayUrl && (
        <section className="panel rows">
          <div className="row">
            <span className="row__label">{lanAccessEnabled && lanUrl ? 'LAN source' : 'Browser source'}</span>
            <span className="row__value"><code className="url">{overlayUrl}</code></span>
            <span className="row__action action-pair">
              <button
                className="iconbtn"
                type="button"
                aria-label="Open overlay in browser"
                title="Open overlay in browser"
                onClick={() => void openExternal(overlayUrl)}
              >
                <ExternalLink size={15} />
              </button>
              <CopyButton text={overlayUrl} />
            </span>
          </div>
          {lanAccessEnabled && previewUrl && previewUrl !== overlayUrl && (
            <div className="row">
              <span className="row__label">Local preview</span>
              <span className="row__value"><code className="url">{previewUrl}</code></span>
              <span className="row__action action-pair">
                <button
                  className="iconbtn"
                  type="button"
                  aria-label="Open local overlay preview"
                  title="Open local overlay preview"
                  onClick={() => void openExternal(previewUrl)}
                >
                  <ExternalLink size={15} />
                </button>
                <CopyButton text={previewUrl} label="Copy local preview URL" />
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

interface TransformPatch {
  x?: number
  y?: number
  scale?: number
  rotation?: number
}

function TransformRows({
  x, y, scale, rotation, onChange,
}: { x: number; y: number; scale: number; rotation: number; onChange: (patch: TransformPatch) => void }) {
  const num = (val: number, min: number, max: number, key: keyof TransformPatch) => (
    <input
      className="numfield"
      type="number"
      min={min}
      max={max}
      value={Math.round(val)}
      onChange={(e) => onChange({ [key]: Number(e.target.value) })}
    />
  )
  return (
    <>
      <div className="row">
        <span className="row__label">Horizontal</span>
        <span className="row__value">
          <input className="slider" type="range" min={0} max={100} value={Math.round(x)}
            onChange={(e) => onChange({ x: Number(e.target.value) })} />
        </span>
        <span className="row__hint num">{num(x, 0, 100, 'x')}<i>%</i></span>
      </div>
      <div className="row">
        <span className="row__label">Vertical</span>
        <span className="row__value">
          <input className="slider" type="range" min={0} max={100} value={Math.round(y)}
            onChange={(e) => onChange({ y: Number(e.target.value) })} />
        </span>
        <span className="row__hint num">{num(y, 0, 100, 'y')}<i>%</i></span>
      </div>
      <div className="row">
        <span className="row__label">Scale</span>
        <span className="row__value">
          <input className="slider" type="range" min={50} max={200} value={scale}
            onChange={(e) => onChange({ scale: Number(e.target.value) })} />
        </span>
        <span className="row__hint num">
          {num(scale, 50, 200, 'scale')}<i>%</i>
          <button className="iconbtn iconbtn--mini" title="Reset scale" onClick={() => onChange({ scale: 100 })}><RotateCcw size={12} /></button>
        </span>
      </div>
      <div className="row">
        <span className="row__label">Rotation</span>
        <span className="row__value">
          <input className="slider" type="range" min={-180} max={180} value={rotation}
            onChange={(e) => onChange({ rotation: Number(e.target.value) })} />
        </span>
        <span className="row__hint num">
          {num(rotation, -180, 180, 'rotation')}<i>°</i>
          <button className="iconbtn iconbtn--mini" title="Reset rotation" onClick={() => onChange({ rotation: 0 })}><RotateCcw size={12} /></button>
        </span>
      </div>
    </>
  )
}

import type { CSSProperties } from 'react'
import {
  ALIGN_TO_FLEX,
  renderTemplate,
  type OverlayElement,
  type OverlaySettings,
  type OverlayTokens,
} from '../lib/overlay/types'

export interface OverlayData extends OverlayTokens {
  goalHit: boolean
  live: boolean
}

interface OverlayPreviewProps {
  settings: OverlaySettings
  data: OverlayData
  /** Resolution px → preview px. Use 1 for the live (full-size) overlay. */
  factor: number
  interactive?: boolean
  selectedId?: string | null
  groupSelected?: boolean
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void
  onGroupPointerDown?: (e: React.PointerEvent) => void
}

function lineText(el: OverlayElement, data: OverlayData): string {
  return renderTemplate(el.template, data)
}

/**
 * Presentational overlay content. Renders the grouped text block or the
 * independent elements directly into the canvas coordinate space (% positions).
 * Kept visually in sync with src-tauri/src/overlay.html.
 */
export function OverlayPreview({
  settings,
  data,
  factor,
  interactive,
  selectedId,
  groupSelected,
  onElementPointerDown,
  onGroupPointerDown,
}: OverlayPreviewProps) {
  const visible = settings.elements.filter((el) => el.visible)
  const { group } = settings

  if (group.grouped) {
    const groupStyle: CSSProperties = {
      position: 'absolute',
      left: `${group.x}%`,
      top: `${group.y}%`,
      transform: `translate(-50%, -50%) scale(${factor * (group.scale / 100)}) rotate(${group.rotation}deg)`,
      transformOrigin: 'center center',
      display: 'flex',
      flexDirection: group.direction === 'vertical' ? 'column' : 'row',
      alignItems: ALIGN_TO_FLEX[group.align],
      gap: `${group.gap}px`,
      whiteSpace: 'nowrap',
    }
    return (
      <div
        className={`ovp-group ${interactive ? 'ovp-interactive' : ''} ${groupSelected ? 'ovp-selected' : ''}`}
        style={groupStyle}
        onPointerDown={onGroupPointerDown}
      >
        {visible.map((el) => (
          <div
            key={el.id}
            className="ovp-line"
            style={{ fontSize: el.fontSize, color: el.color, textAlign: group.align }}
          >
            {lineText(el, data)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {visible.map((el) => (
        <div
          key={el.id}
          className={`ovp-line ovp-float ${interactive ? 'ovp-interactive' : ''} ${selectedId === el.id ? 'ovp-selected' : ''}`}
          style={{
            position: 'absolute',
            left: `${el.x}%`,
            top: `${el.y}%`,
            transform: `translate(-50%, -50%) scale(${factor * (el.scale / 100)}) rotate(${el.rotation}deg)`,
            transformOrigin: 'center center',
            fontSize: el.fontSize,
            color: el.color,
            whiteSpace: 'nowrap',
          }}
          onPointerDown={(e) => onElementPointerDown?.(el.id, e)}
        >
          {lineText(el, data)}
        </div>
      ))}
    </>
  )
}

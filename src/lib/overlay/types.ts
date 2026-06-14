// Overlay customization model (position / scale / opacity + widget vs custom text).
// Mirrors the rocketsession approach: x/y/scale/opacity as percentages, plus a mode.

export type OverlayMode = 'widget' | 'text'

export interface OverlayTextStyle {
  template: string
  fontSize: number // px on a 1920-wide canvas
  color: string
  align: 'left' | 'center' | 'right'
}

export interface OverlayResolution {
  width: number
  height: number
}

export interface OverlaySettings {
  x: number // 0–100 (% of canvas width, anchor = element center)
  y: number // 0–100 (% of canvas height)
  scale: number // 50–200 (%)
  opacity: number // 0–100
  mode: OverlayMode
  /** OBS canvas resolution the editor preview mimics so it's WYSIWYG. */
  resolution: OverlayResolution
  text: OverlayTextStyle
}

export const RESOLUTION_PRESETS: Array<{ label: string } & OverlayResolution> = [
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '2560 × 1440', width: 2560, height: 1440 },
  { label: '3840 × 2160', width: 3840, height: 2160 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1080 × 1920 · vertical', width: 1080, height: 1920 },
  { label: '720 × 1280 · vertical', width: 720, height: 1280 },
]

export const DEFAULT_OVERLAY: OverlaySettings = {
  x: 50,
  y: 88,
  scale: 100,
  opacity: 100,
  mode: 'widget',
  resolution: { width: 1920, height: 1080 },
  text: {
    template: 'DAILY GOAL  {current}/{target}     STREAK  {streak}',
    fontSize: 38,
    color: '#ffffff',
    align: 'center',
  },
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Values available to the custom-text template. */
export interface OverlayTokens {
  current: number
  target: number
  remaining: number
  pct: number
  streak: number
  best: number
}

export function renderTemplate(template: string, t: OverlayTokens): string {
  return template
    .replace(/\{current\}/g, String(t.current))
    .replace(/\{target\}/g, String(t.target))
    .replace(/\{remaining\}/g, String(t.remaining))
    .replace(/\{pct\}/g, String(t.pct))
    .replace(/\{streak\}/g, String(t.streak))
    .replace(/\{best\}/g, String(t.best))
}

export const OVERLAY_TOKENS = ['{current}', '{target}', '{remaining}', '{pct}', '{streak}', '{best}']

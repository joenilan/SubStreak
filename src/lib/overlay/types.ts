// Overlay customization model (position / scale / opacity + widget vs custom text).
// Mirrors the rocketsession approach: x/y/scale/opacity as percentages, plus a mode.

export type OverlayMode = 'widget' | 'text'

export interface OverlayTextStyle {
  template: string
  fontSize: number // px on a 1920-wide canvas
  color: string
  align: 'left' | 'center' | 'right'
}

export interface OverlaySettings {
  x: number // 0–100 (% of canvas width, anchor = element center)
  y: number // 0–100 (% of canvas height)
  scale: number // 50–200 (%)
  opacity: number // 0–100
  mode: OverlayMode
  text: OverlayTextStyle
}

export const DEFAULT_OVERLAY: OverlaySettings = {
  x: 50,
  y: 88,
  scale: 100,
  opacity: 100,
  mode: 'widget',
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

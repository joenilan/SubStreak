// Overlay customization model.
//
// The overlay is a set of independent elements (daily goal, streak, free text).
// By default they're "grouped": laid out like a little text block (vertical or
// horizontal, left/center/right justified) that drags as one unit. Ungroup and
// each element floats independently with its own position, scale, and rotation.

export type OverlayElementKind = 'dailyGoal' | 'streak' | 'text'
export type GroupDirection = 'vertical' | 'horizontal'
export type GroupAlign = 'left' | 'center' | 'right'

export interface OverlayElement {
  id: string
  kind: OverlayElementKind
  visible: boolean
  /** Line template, e.g. "Daily Sub Goal: {current}/{target}". */
  template: string
  fontSize: number // px on the chosen canvas (WYSIWYG with OBS resolution)
  color: string
  // Independent transform — used when ungrouped. When grouped, the group lays
  // elements out and only the element's own scale/rotation still apply.
  x: number // 0–100 (% of canvas width, anchor = element center)
  y: number // 0–100 (% of canvas height)
  scale: number // 50–200 (%)
  rotation: number // degrees, -180–180
}

export interface OverlayGroup {
  grouped: boolean
  x: number // 0–100 group anchor (center)
  y: number
  scale: number // 50–200 (%)
  rotation: number // degrees
  direction: GroupDirection
  align: GroupAlign
  gap: number // px between items on the chosen canvas
}

export interface OverlayResolution {
  width: number
  height: number
}

export interface OverlaySettings {
  opacity: number // 0–100, applies to the whole overlay
  /** OBS canvas resolution the editor preview mimics so it's WYSIWYG. */
  resolution: OverlayResolution
  /** When enabled, expose the OBS overlay URL on the private LAN for dual-PC setups. */
  lanAccessEnabled: boolean
  group: OverlayGroup
  elements: OverlayElement[]
}

export const RESOLUTION_PRESETS: Array<{ label: string } & OverlayResolution> = [
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '2560 × 1440', width: 2560, height: 1440 },
  { label: '3840 × 2160', width: 3840, height: 2160 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1080 × 1920 · vertical', width: 1080, height: 1920 },
  { label: '720 × 1280 · vertical', width: 720, height: 1280 },
]

export function defaultElements(): OverlayElement[] {
  return [
    {
      id: 'dailyGoal',
      kind: 'dailyGoal',
      visible: true,
      template: 'Daily Sub Goal: {current}/{target}',
      fontSize: 38,
      color: '#ffffff',
      x: 50,
      y: 82,
      scale: 100,
      rotation: 0,
    },
    {
      id: 'streak',
      kind: 'streak',
      visible: true,
      template: 'Sub Goal Streak: {streak}',
      fontSize: 38,
      color: '#ffffff',
      x: 50,
      y: 92,
      scale: 100,
      rotation: 0,
    },
  ]
}

export const DEFAULT_OVERLAY: OverlaySettings = {
  opacity: 100,
  resolution: { width: 1920, height: 1080 },
  lanAccessEnabled: false,
  group: {
    grouped: true,
    x: 50,
    y: 88,
    scale: 100,
    rotation: 0,
    direction: 'vertical',
    align: 'center',
    gap: 8,
  },
  elements: defaultElements(),
}

export function cloneOverlay(o: OverlaySettings): OverlaySettings {
  return {
    ...o,
    resolution: { ...o.resolution },
    group: { ...o.group },
    elements: o.elements.map((el) => ({ ...el })),
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function newTextElement(): OverlayElement {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `text-${Date.now()}`
  return {
    id,
    kind: 'text',
    visible: true,
    template: 'Custom text',
    fontSize: 38,
    color: '#ffffff',
    x: 50,
    y: 50,
    scale: 100,
    rotation: 0,
  }
}

/** Values available to element templates. */
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

export const ALIGN_TO_FLEX: Record<GroupAlign, 'flex-start' | 'center' | 'flex-end'> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
}

// ---- Migration from the pre-elements overlay shape -------------------------

interface LegacyOverlay {
  x?: number
  y?: number
  scale?: number
  opacity?: number
  mode?: 'widget' | 'text'
  resolution?: OverlayResolution
  lanAccessEnabled?: boolean
  text?: { template?: string; fontSize?: number; color?: string; align?: GroupAlign }
}

/** True once the persisted overlay uses the new elements/group shape. */
export function isNewOverlay(value: unknown): value is OverlaySettings {
  return !!value && typeof value === 'object' && Array.isArray((value as OverlaySettings).elements)
}

/** Convert an older saved overlay (single mode + one position) into the new model. */
export function migrateOverlay(legacy: LegacyOverlay): OverlaySettings {
  const elements = defaultElements()
  const align = legacy.text?.align ?? 'center'
  const fontSize = legacy.text?.fontSize ?? 38
  const color = legacy.text?.color ?? '#ffffff'

  // Preserve a custom text template from the old "text" mode as a text element.
  if (legacy.mode === 'text' && legacy.text?.template) {
    elements.push({
      ...newTextElement(),
      id: 'legacy-text',
      template: legacy.text.template,
      fontSize,
      color,
    })
    // Old text mode only showed the template, so hide the stock lines.
    elements[0].visible = false
    elements[1].visible = false
  } else {
    for (const el of elements) {
      el.fontSize = fontSize
      el.color = color
    }
  }

  return {
    opacity: legacy.opacity ?? 100,
    resolution: legacy.resolution ?? { width: 1920, height: 1080 },
    lanAccessEnabled: legacy.lanAccessEnabled ?? false,
    group: {
      grouped: true,
      x: legacy.x ?? 50,
      y: legacy.y ?? 88,
      scale: legacy.scale ?? 100,
      rotation: 0,
      direction: 'vertical',
      align,
      gap: 8,
    },
    elements,
  }
}

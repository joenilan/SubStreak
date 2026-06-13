// Minimal EventSub WebSocket client for SubStreak. We only ever subscribe to
// the events that drive the daily goal + streak.

const WS_URL = 'wss://eventsub.wss.twitch.tv/ws'
const CREATE_SUBSCRIPTION_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const STREAMS_URL = 'https://api.twitch.tv/helix/streams'

export interface EventSubSubscriptionRequest {
  type: string
  version: string
  condition: Record<string, string>
}

export interface EventSubTransportSession {
  id: string
  reconnectUrl: string | null
}

export interface EventSubEnvelope {
  metadata?: {
    message_id?: string
    message_type?: string
    subscription_type?: string
  }
  payload?: {
    session?: {
      id?: string
      status?: string
      reconnect_url?: string | null
    }
    subscription?: { type?: string }
    event?: Record<string, unknown>
  }
}

/** The only subscriptions SubStreak cares about. */
export const SUBSTREAK_SUBSCRIPTIONS: ReadonlyArray<Omit<EventSubSubscriptionRequest, 'condition'>> = [
  { type: 'channel.subscribe', version: '1' },
  { type: 'channel.subscription.gift', version: '1' },
  { type: 'channel.subscription.message', version: '1' },
  { type: 'stream.online', version: '1' },
]

export function buildSubscriptionRequests(broadcasterUserId: string): EventSubSubscriptionRequest[] {
  return SUBSTREAK_SUBSCRIPTIONS.map((sub) => ({
    ...sub,
    condition: { broadcaster_user_id: broadcasterUserId },
  }))
}

export function openEventSubSocket(url = WS_URL) {
  return new WebSocket(url)
}

export function parseEventSubEnvelope(raw: string): EventSubEnvelope {
  return JSON.parse(raw) as EventSubEnvelope
}

export function mapTransportSession(envelope: EventSubEnvelope): EventSubTransportSession | null {
  const session = envelope.payload?.session
  if (!session?.id) return null
  return {
    id: session.id,
    reconnectUrl: typeof session.reconnect_url === 'string' ? session.reconnect_url : null,
  }
}

export async function createEventSubSubscription(
  clientId: string,
  accessToken: string,
  sessionId: string,
  request: EventSubSubscriptionRequest,
): Promise<void> {
  const response = await fetch(CREATE_SUBSCRIPTION_URL, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: request.type,
      version: request.version,
      condition: request.condition,
      transport: { method: 'websocket', session_id: sessionId },
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(payload.message || payload.error || `Subscription failed for ${request.type}.`)
  }
}

/** Helix poll so we know if the channel is already live when the app launches. */
export async function fetchIsLive(
  clientId: string,
  accessToken: string,
  broadcasterUserId: string,
): Promise<boolean> {
  const url = `${STREAMS_URL}?user_id=${encodeURIComponent(broadcasterUserId)}`
  const response = await fetch(url, {
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return false
  const payload = (await response.json().catch(() => ({}))) as { data?: unknown[] }
  return Array.isArray(payload.data) && payload.data.length > 0
}

import type { EventSubEnvelope } from './eventsub'

/** A streak-engine input derived from a Twitch EventSub notification, plus a dedupe id. */
export type NormalizedStreakEvent =
  | { messageId: string; input: { kind: 'sub'; count: number } }
  | { messageId: string; input: { kind: 'stream-online' } }

/**
 * Map a raw EventSub notification to a streak input.
 * Returns null for messages we don't act on.
 */
export function normalizeSubEvent(envelope: EventSubEnvelope): NormalizedStreakEvent | null {
  const type = envelope.metadata?.subscription_type ?? envelope.payload?.subscription?.type
  const event = envelope.payload?.event
  const messageId = envelope.metadata?.message_id
  if (!type || !messageId) return null

  switch (type) {
    case 'channel.subscribe':
      // A single new subscription. Gift subs arrive separately as gift events,
      // and channel.subscribe carries is_gift=true for each gifted sub — skip
      // those to avoid double-counting against the gift event's total.
      if (event && (event as { is_gift?: boolean }).is_gift === true) return null
      return { messageId, input: { kind: 'sub', count: 1 } }

    case 'channel.subscription.message':
      // Resub.
      return { messageId, input: { kind: 'sub', count: 1 } }

    case 'channel.subscription.gift': {
      const total = typeof event?.total === 'number' ? event.total : 1
      return { messageId, input: { kind: 'sub', count: Math.max(1, total) } }
    }

    case 'stream.online':
      return { messageId, input: { kind: 'stream-online' } }

    default:
      return null
  }
}

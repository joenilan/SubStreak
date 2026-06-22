import { useEffect, useRef } from 'react'
import { TWITCH_CLIENT_ID } from '../lib/twitch/constants'
import {
  buildSubscriptionRequests,
  createEventSubSubscription,
  fetchIsLive,
  mapTransportSession,
  openEventSubSocket,
  parseEventSubEnvelope,
} from '../lib/twitch/eventsub'
import { normalizeSubEvent } from '../lib/twitch/normalizeSubEvent'
import { useSubStreakStore } from '../state/useSubStreakStore'
import { useTwitchStore } from '../state/useTwitchStore'

const SEEN_LIMIT = 500

/**
 * Maintains an EventSub WebSocket while a Twitch session is connected, subscribes
 * to the sub + stream.online events, and feeds them into the streak store.
 */
export function useEventSub() {
  const status = useTwitchStore((s) => s.status)
  const userId = useTwitchStore((s) => s.session?.userId ?? null)

  const wsRef = useRef<WebSocket | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const closedByUs = useRef(false)

  useEffect(() => {
    if (status !== 'connected' || !userId) return

    closedByUs.current = false
    const ingest = useSubStreakStore.getState().ingest
    const setTwitch = useTwitchStore.getState().set

    const accessToken = () => useTwitchStore.getState().tokens?.accessToken ?? ''

    // Reconcile live state on launch: mark live if mid-stream, otherwise close
    // any session that was left "live" in persisted state (we missed the offline).
    void fetchIsLive(TWITCH_CLIENT_ID, accessToken(), userId).then((live) => {
      ingest({ kind: live ? 'stream-online' : 'stream-offline' })
    })

    const connect = (url?: string) => {
      const ws = openEventSubSocket(url)
      wsRef.current = ws

      ws.onmessage = async (raw) => {
        let envelope
        try {
          envelope = parseEventSubEnvelope(raw.data as string)
        } catch {
          return
        }

        const type = envelope.metadata?.message_type
        if (type === 'session_welcome') {
          const session = mapTransportSession(envelope)
          if (!session) return
          setTwitch({ eventSubConnected: true })
          // Register all subscriptions against the welcome session id.
          const token = accessToken()
          await Promise.all(
            buildSubscriptionRequests(userId).map((req) =>
              createEventSubSubscription(TWITCH_CLIENT_ID, token, session.id, req).catch((err) => {
                setTwitch({ error: err instanceof Error ? err.message : String(err) })
              }),
            ),
          )
        } else if (type === 'session_reconnect') {
          const session = mapTransportSession(envelope)
          if (session?.reconnectUrl) {
            closedByUs.current = true
            wsRef.current?.close()
            connect(session.reconnectUrl)
          }
        } else if (type === 'notification') {
          const normalized = normalizeSubEvent(envelope)
          if (!normalized) return
          if (seenRef.current.has(normalized.messageId)) return
          seenRef.current.add(normalized.messageId)
          if (seenRef.current.size > SEEN_LIMIT) {
            seenRef.current = new Set([...seenRef.current].slice(-SEEN_LIMIT))
          }
          ingest(normalized.input)
        }
      }

      ws.onclose = () => {
        setTwitch({ eventSubConnected: false })
        if (closedByUs.current) return
        // Reconnect after a short delay unless we tore down intentionally.
        window.setTimeout(() => {
          if (!closedByUs.current && useTwitchStore.getState().status === 'connected') {
            connect()
          }
        }, 3000)
      }
    }

    connect()

    return () => {
      closedByUs.current = true
      wsRef.current?.close()
      wsRef.current = null
      setTwitch({ eventSubConnected: false })
    }
  }, [status, userId])
}

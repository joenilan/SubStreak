// SubStreak needs far fewer scopes than the parent app:
//   - channel:read:subscriptions → subs / resubs / gift subs
//   - stream.online needs NO scope (it's a public broadcaster event)
export const TWITCH_SCOPES = ['channel:read:subscriptions'] as const
export const TWITCH_SCOPE_STRING = TWITCH_SCOPES.join(' ')

/** Set VITE_TWITCH_CLIENT_ID in a .env file (or the shell) before logging in. */
export const TWITCH_CLIENT_ID = (import.meta.env.VITE_TWITCH_CLIENT_ID as string | undefined)?.trim() ?? ''

export function isTwitchConfigured(): boolean {
  return TWITCH_CLIENT_ID.length > 0
}

export const TWITCH_VALIDATE_INTERVAL_MS = 60 * 60 * 1000 // validate hourly
export const TWITCH_REFRESH_EARLY_MS = 5 * 60 * 1000 // refresh 5 min before expiry

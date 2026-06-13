# SubStreak — Plan & Working Spec

SubStreak is a small, **set-and-forget** Twitch desktop app that shows a **daily sub goal** and a **daily streak**, built on the proven release/auth/overlay foundation from the sibling `subathon_timer` app (`../desktop`).

This folder is its **own git repo**, nested inside `subathon_timer/apps/` and gitignored from it, so we can develop both in parallel. The eventual plan is to fold SubStreak back into `subathon_timer` as a feature (it already lives where it would land: `apps/`).

- Name / identifier: **SubStreak** / `com.dreadedzombie.substreak`
- Download slug: `substreak` (same server as the parent: `https://apps.zombie.digital/downloads/substreak`)

---

## 1. Product

Two stacked sections in one small window + OBS overlay:

### Daily sub goal
- Displays `Daily sub goal: 0/1` (target configurable).
- Counts subs for the current **stream day** and auto-resets at day rollover.

### Daily streak
- Counts **consecutive streamed days where the goal was hit**.
- Rules (the streamer's exact ask):
  1. Only days the channel went **live** affect the streak.
  2. On a live day, hitting the goal **increments** the streak.
  3. A live day that **misses** the goal **resets** the streak to 0.
  4. Days with **no stream** are neutral — they neither extend nor break it.

Priorities: set-and-forget (auth once, auto-updates), simple (don't overwhelm the user), and somewhat visually appealing.

---

## 2. The streak engine — BUILT ✅

The hard part (the streak state machine) is implemented and unit-tested:

- `src/lib/streak/types.ts` — config + state + input types.
- `src/lib/streak/engine.ts` — pure reducer `applyInput(state, input, config)`, plus `getStreamDayKey` and a `getDisplay` view model.
- `src/lib/streak/engine.test.ts` — 12 passing tests covering all four rules + edges.

Run: `bun install && bun run test` (vitest, 12/12 green).

How it works:
- **Inputs**: `sub` (carries gift-bomb `count`), `stream-online`, and `tick` (app launch / periodic, used only to trigger rollover).
- **Stream day**: `getStreamDayKey` applies a configurable **rollover hour** (default midnight; set ~5–6am so post-midnight streams stay the same day) in the streamer's timezone.
- **Live credit**: the streak ticks up the instant `wasLiveToday && todaySubs >= target` (re-checked on every input, so subs arriving before going live still credit once `stream-online` lands). Credited at most once per day.
- **Lazy close-out**: when an input reveals the day has rolled over, the previous day is finalized — streamed-and-missed → reset; streamed-and-hit → keep; not-streamed → untouched. Multiple idle days collapse to one neutral finalize, so a missed goal yesterday breaks the streak as soon as the app sees *any* event today (including a launch `tick`).
- **Determinism**: the engine takes `at: Date` on every input and does no I/O — fully testable.

State also tracks `longestStreak` and `lastGoalHitDay` for the overlay.

### Still to wire around the engine
- Persist `SubStreakState` + `SubStreakConfig` to disk (set-and-forget across restarts/days).
- On launch: load state, poll Helix for current live status, and feed a `tick` to finalize any day that ended while closed.
- Feed live Twitch events (subs + `stream.online`) into `applyInput`.

---

## 3. Foundation to port from `../desktop`

This is the proven infrastructure to reuse (the reason we forked rather than greenfielded). Adapt names/paths to `substreak`.

### Versioning
`../desktop/scripts/version.mjs` — one `VERSION` file drives `package.json`, `tauri.conf.json`, `Cargo.toml`; `version:patch/minor/major/set/sync/check`. Keep `CHANGELOG.md` + `PATCH_NOTES.md`.

### Publishing (build → sign → ship)
`../desktop/scripts/package-release.mjs` + `publish-release.mjs`: builds Windows msi/nsis/portable, signs the NSIS installer with the Tauri updater key, SFTPs to the server, writes `latest.json` (site button) + `updater.json` (updater feed) + `archive/`. Secrets come from `.env.raspi` at repo root (`SSH_*`, `TAURI_SIGNING_PRIVATE_KEY_PATH/PASSWORD`, `RELEASE_APP_SLUG=substreak`, `RPI_RELEASE_BASE_DIR`). **Generate a NEW signing keypair** (`tauri signer generate`) — never reuse the parent's.

### Auto-update
`tauri.conf.json` → `plugins.updater` with the new `pubkey` and endpoint `https://apps.zombie.digital/downloads/substreak/updater.json`. The signing key in `publish-release.mjs` and this `pubkey` are two halves of one trust chain — regenerate together. The parent's recent commits already debugged the endpoint, `latest.json`/`updater.json` split, signer flag, and `.env.raspi` source — copy that fixed version.

### Native Twitch auth (this is what makes set-and-forget work)
Reuse `../desktop/src/hooks/useTwitchSessionLifecycle.ts` + `src/lib/twitch/constants.ts`: device-code flow, tokens in native secure storage, validate hourly, refresh ~5 min early. The streamer logs in once and the app keeps the token alive — no backend, no expiring browser token. **Register a fresh Twitch app** for a new client ID.

### Overlay serving
Reuse the loopback server in `../desktop/src-tauri/src/lib.rs` to serve the OBS browser-source URL.

---

## 4. Twitch specifics

**Scopes**: `channel:read:subscriptions` for subs. Going-live detection (`stream.online`) needs **no scope**.

**EventSub subscriptions** (WebSocket, `wss://eventsub.wss.twitch.tv/ws`):
- `channel.subscribe` (v1) — new subs.
- `channel.subscription.gift` (v1) — gift subs / gift bombs (quantity → `count`).
- `channel.subscription.message` (v1) — resubs.
- `stream.online` (v1) — marks the day as streamed → feeds the streak `stream-online` input.

Optional: `stream.offline` (v1) and a Helix `GET /streams` poll on launch to recover live status if the app started mid-stream. Normalize events the way `../desktop/src/lib/twitch/normalizeEventSubMessage.ts` does; dedupe subs by `source:eventId`.

---

## 5. Do NOT bring over
Shared-session P2P, the spin wheel + moderation scopes, tip providers, multi-ladder goals, the timer, chat announcements (maybe later). Keep it to: Tauri shell, version/release/updater pipeline, native Twitch auth, loopback overlay, and the streak engine.

---

## 6. Build order
1. ✅ Streak engine + tests.
2. Scaffold a slim Tauri app (copy `../desktop` shell, strip to one page + one overlay route).
3. Port version/release/updater pipeline; new signing keypair; `.env.raspi` with `RELEASE_APP_SLUG=substreak`.
4. New Twitch app; wire device-code auth + native token storage + auto-refresh.
5. EventSub: subs + `stream.online`; feed normalized events into `applyInput`.
6. Persist state/config; on launch poll live status + `tick` to finalize.
7. UI: daily goal section + streak section (somewhat polished). Overlay served from loopback.
8. Tiny control: set goal target, set rollover hour, manual reset.
9. Real `release:publish`; confirm auto-update end-to-end.

---

## 7. Merge-back note
When folding into `subathon_timer`: the streak engine drops into `apps/desktop/src/lib/` as-is, and the daily-goal/streak UI becomes an extra section/overlay. Keeping the engine pure and provider-agnostic now is what makes that merge cheap later.

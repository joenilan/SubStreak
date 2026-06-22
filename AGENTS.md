# Repository Guidelines

## Project Structure & Module Organization

SubStreak is a Tauri 2 desktop app with a React/Vite front end and Rust native shell. Front-end code lives in `src/`: `views/` contains screen UI, `components/` reusable React pieces, `hooks/` integrations, `state/` Zustand stores, and `lib/` domain/platform helpers. Vitest tests sit beside implementation files, for example `src/lib/streak/engine.test.ts`. Native code and assets live in `src-tauri/`, including Rust modules in `src-tauri/src/`, Tauri capabilities in `src-tauri/capabilities/`, icons in `src-tauri/icons/`, and fonts in `src-tauri/fonts/`. Release and version helpers are in `scripts/`.

## Build, Test, and Development Commands

Use Bun, matching `bun.lock`.

- `bun install`: install JavaScript dependencies.
- `bun run dev`: run the Vite front end on `127.0.0.1:1420`.
- `bun run tauri:dev`: run the full desktop app.
- `bun run build`: type-check with `tsc` and build the Vite output.
- `bun run test`: run Vitest once.
- `bun run test:watch`: run Vitest in watch mode.
- `bun run tauri:build`: build the Tauri app.
- `bun run version:check`: verify version metadata before release.

For Rust-only validation, run `cargo test` from `src-tauri/`.

## Coding Style & Naming Conventions

TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` are enabled). Use React function components, named exports, and PascalCase for components such as `OverlayPreview`. Hooks use `useX`, stores use `useXStore`, and domain helpers stay under `src/lib/<domain>/`. Follow existing formatting: two-space indentation in TypeScript/TSX, single quotes, and no semicolons. Rust uses standard `rustfmt` style and snake_case module/function names.

## Testing Guidelines

Use Vitest for TypeScript tests. Keep tests close to the code they cover and name files `*.test.ts` or `*.test.tsx`. Prefer deterministic dates, explicit fixtures, and behavioral assertions for streak logic and Twitch event normalization. Run `bun run test` before submitting changes that touch `src/lib`, state, or hooks; run `bun run build` when changing exported types or UI flows.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative summaries, often with a scope phrase, such as `Overlay canvas: robust aspect-fit + configurable resolution`. Keep subjects specific and under roughly 72 characters when practical. Pull requests should describe the behavior change, list validation commands run, link related issues, and include screenshots or short clips for UI and overlay changes.

## Security & Configuration Tips

Copy `.env.example` to `.env` for local configuration. Do not commit `.env`, Twitch credentials, updater signing keys, or server upload secrets. `VITE_TWITCH_CLIENT_ID` is public, but signing and SSH values are release-only secrets.

## Releasing & Updater Signing

The Tauri updater only accepts an update whose `updater.json` signature was produced by the key matching `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. For SubStreak that is **`substreak.key`** (pubkey key id `AE935A5F100C6FF0`). Signing with any other key makes the in-app updater fail at install time with a red "update install failed" button.

`scripts/publish-release.mjs` merges env from the parent `.env.raspi` first, then the local `.env`, then `process.env`. The parent file points `TAURI_SIGNING_PRIVATE_KEY_PATH` at `subathon-timer.key` (a different app's key), so if the local `.env` override does not win, releases get signed with the wrong key. This shipped broken in 0.1.3.

The local `.env` sets `TAURI_SIGNING_PRIVATE_KEY_PATH` to `substreak.key` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to empty (that key has no password). `publish-release.mjs` now re-pins both of those vars from the local `.env` *after* the merge, so an inherited `TAURI_SIGNING_*` in `process.env` (e.g. the parent app's `subathon-timer.key` + its password, left over from a prior shell) can no longer win and mis-sign. So `bun run release:publish` just works — no manual env override needed.

When publishing SubStreak:

- Don't set `TAURI_SIGNING_PRIVATE_KEY_PATH` / `_PASSWORD` by hand; let the local `.env` drive them. If you must override (CI), edit the local `.env` rather than relying on shell env, since the script intentionally ignores `process.env` for these two vars.
- The publish script aborts before upload if the installer's signing key id does not match `tauri.conf.json`'s `pubkey` — do not bypass that guard; fix the key instead.
- Never swap `tauri.conf.json`'s `pubkey` to "match" a stray signing key: installed apps verify against the pubkey they were built with, so changing it orphans every existing install.

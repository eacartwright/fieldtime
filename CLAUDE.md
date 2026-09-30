# fieldtime — notes for Claude

A personal work log for an MSP tech: frictionless start/stop of tasks plus quick notes, on
Windows desktops and an iPhone. **[DESIGN.md](DESIGN.md) is the spec**; read the relevant section
before changing behavior, and update it when a decision changes. v1 (April 2026, React/Supabase)
lives in `v1/` and on the `archive/v1` branch — reference only.

## Run / test

```sh
npm install
npm run dev        # server :8787 + web :5173 (proxies /api); phone uses the LAN "Network" URL
npm test           # vitest: reducer rules in packages/shared
npm run typecheck  # tsc (TypeScript 7) over all three packages
```

Data is `data/fieldtime.db` (SQLite, git-ignored, **per machine**). To test without touching the
user's real data, run on other ports against a scratch DB:
`FIELDTIME_DB=<scratch>/t.db PORT=8797 node --import tsx packages/server/src/index.ts` and
`FIELDTIME_API=http://localhost:8797 npx vite --port 5183` (from `packages/web`).
Browser checks: `playwright-core` with `channel: "msedge"` (Edge is installed; no browser download).

## Architecture

- `packages/shared` — types, ops, **the reducer**, derived views. Used by both server and client.
- `packages/server` — Node + Hono + better-sqlite3. Applies op batches idempotently (op ids
  recorded in `ops` table), persists touched entities, bumps a global `rev`, pushes changes over SSE.
- `packages/web` — React + Vite. `sync.ts`: view = server state + pending ops replayed through the
  same reducer; pending ops persist in localStorage before sending (the outbox).

Every change is an **op**. To add one: type in `shared/src/ops.ts` (+ `OP_TYPES`), handle it in
`shared/src/reducer.ts`, add tests in `reducer.test.ts`. The reducer must be deterministic and
safe to re-apply (the client replays pending ops on top of server state).

Schema changes: **append** a migration to `MIGRATIONS` in `server/src/db.ts`; never edit old ones.
Deletions are tombstones (`deleted` flag), so they sync like any other change.

## Rules the reducer enforces (see DESIGN.md §5–6)

- Each task has at most one open session; several tasks may run at once.
- `task.start` mode: `switch` (default) stops others at the same instant; `alongside` doesn't.
  UI: ▶ New and the switcher switch; ▶ on a list row / task details adds alongside; Shift inverts.
- Blips (< 30 s, no notes, not the task's only session) are discarded when they end.
- Continuing a task within 10 min of its last session reopens that session.
- Merge: same task, earliest start → latest end, non-empty notes joined. UI limits to one day.
- Start/stop use timeline semantics, so ops arriving late from an offline phone land correctly.

## UI conventions

- All colors are tokens in `web/src/styles.css` (light + dark). No inline styles for color.
- Tap targets ≥ 44px; inputs 16px (prevents iOS zoom). Focus states always visible.
- The top running card's notes `<textarea>` must stay mounted (cards are keyed by position) and
  be focused synchronously in the tap handler — that's what raises the iPhone keyboard.
- Synced text fields use `DraftInput`/`DraftTextarea`, which reset their draft **during render**
  when the record changes (resetting in an effect let keystrokes leak into the previous record).

## Gotchas

- `tsx watch` hangs under `concurrently` on Windows; the server uses `node --watch --import tsx`.
- `npm i -w <pkg> a b && npm i -D -w <pkg> c` has dropped the first install's entries from
  package.json. Install workspace deps one command at a time and check package.json after.
- `crypto.randomUUID` needs a secure context; use `newId()` from shared (the phone hits http on the LAN).

## Status

- Done: M1 core loop — ▶ New / continue / alongside / stop, stacked running cards, switcher
  (Ctrl+K), inbox, task detail with merge, live sync, outbox.
- Next: deploy to the always-on mini PC behind **Cloudflare Tunnel + Access**
  ([docs/home-hosting.md](docs/home-hosting.md)), auto-start + nightly DB backup. Then **M1.5 Day calendar**
  (drag/resize sessions, fill gaps), which should carry most of M1's remaining time editing,
  Day report, and copy-for-ConnectWise export.

## Working with Evan

- Commit and push only when asked.
- Prefers the Claude desktop app / claude.ai over the terminal. Development is moving to the mini
  PC and gets reached through Remote Control from the other devices; see
  [docs/mini-pc-setup.md](docs/mini-pc-setup.md). Give GUI steps, not shell commands, where
  possible.
- Uses two Windows PCs (desktop + another) and an iPhone 13; the mini PC (Intel N97, Win 11)
  will host the server.

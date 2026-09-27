# fieldtime

A personal work log: frictionless start/stop and note-taking for whatever you're working on,
on desktop and phone. See [DESIGN.md](DESIGN.md) for the full design.

The April 2026 React/Supabase version lives in [v1/](v1/) (and on the `archive/v1` branch).

## Run it

Requires Node 24+.

```sh
npm install
npm run dev
```

- Desktop: http://localhost:5173
- Phone (same Wi-Fi): `http://<this PC's IP>:5173`. Vite prints the Network URLs on startup.
  Windows may ask to allow Node through the firewall the first time.

Data lives in `data/fieldtime.db` (SQLite, git-ignored). Set `FIELDTIME_DB` to use another file.

## Using it

| Action | Desktop | Phone |
|---|---|---|
| Start a new task (stops what's running) | **Alt+N** or ▶ New | ▶ New (bottom bar) |
| Start a new task alongside | **Alt+Shift+N** or Shift+▶ New | + Also working on… |
| Just start typing when nothing is running | click the notes box | tap the notes box |
| Continue a task from the list (adds to what's running) | ▶ on the row (Shift+click = switch to just this) | ▶ on the row |
| Find / switch to any task | **Ctrl+K** or **/** (Shift+Enter = alongside) | Find |
| Stop | **Alt+P** (top card) | Stop on the card or list row |
| Add to inbox (don't start) | **Alt+I** | + Inbox |

- A task has no title until you give it one; the first line of your notes stands in.
- A session left with empty notes counts as "continuation of previous work".
- Sessions under 30 seconds with no notes are discarded (except a task's first).
- Continuing a task within 10 minutes of stopping it reopens the same session.
- Merge sessions in task details: tap one, tap another, and everything between is selected.

## Layout

```
packages/
  shared/   data model, ops, the reducer that enforces "one thing running", derived views (+ tests)
  server/   Node + Hono + SQLite: applies ops, persists, pushes live updates (SSE)
  web/      React + Vite UI, local copy + outbox so nothing waits on the network
v1/         the original app, untouched
```

```sh
npm test          # reducer tests
npm run typecheck
```

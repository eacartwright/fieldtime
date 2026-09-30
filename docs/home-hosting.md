# Hosting apps from home

The mini PC hosts fieldtime, and later any other personal app, so each is reachable from
anywhere at `https://<app>.<yourdomain>` behind one login. There are no router changes and no
open ports.

```
 any browser / iPhone
        │  https://fieldtime.<yourdomain>
        ▼
 Cloudflare ── Access: "is this Evan?"  (email code or Google sign-in; everyone else stops here)
        │
        │  outbound tunnel that cloudflared keeps open from the mini PC
        ▼
 mini PC: cloudflared ──▶ localhost:8080  fieldtime
                     └──▶ localhost:8081  next app …
```

## Why this setup

- **No port forward.** `cloudflared` on the mini PC connects *out* to Cloudflare. The router, the
  home IP and dynamic DNS don't matter, and nothing on the home network is exposed.
- **The login is Cloudflare Access, not app code.** One policy (`*.<yourdomain>` → allow
  only my email) covers every app now and later. A new app is protected before it has any
  auth of its own.
- **HTTPS is automatic.** Cloudflare provides the certificates, which the iPhone PWA install needs.
- **Cost:** a domain (~$10/yr). Tunnel and Access are free for one person.
- **Tailscale stays** for the private side: Remote Desktop, VS Code Remote-SSH and the dev server
  (see [mini-pc-setup.md](mini-pc-setup.md)). Only finished apps go through the tunnel.

Rejected options:
- **Port forwarding:** exposes an unauthenticated server and needs self-managed certificates and
  dynamic DNS.
- **Tailscale Funnel:** public, but has no login gate.
- **Supabase or Cloudflare Pages:** would mean rewriting the server for each platform (v1 was
  Supabase), and every future app would be bound to that platform's model. Home hosting runs
  anything that runs on Windows. The trade-off: if home power or internet is down, the apps are
  unreachable. fieldtime's outbox keeps working offline and syncs later, so it can live with that.

## Conventions for every app

| | |
|---|---|
| Code | `C:\Apps\<app>` (a clone that only pulls `main`; development happens in `C:\Dev\<app>`) |
| Port | fieldtime **8080**, next app 8081, … (dev ports 5173/8787 stay separate) |
| Address | `https://<app>.<yourdomain>` |
| Auto-start | Task Scheduler task "<app>", at system startup, whether signed in or not |
| Data | inside `C:\Apps\<app>\data`, backed up nightly |

## Setup, once

Buying the domain and creating accounts are yours to do. Claude can do the rest on the mini PC.

1. **Domain:** buy one, ideally at Cloudflare Registrar (at-cost pricing, and it's already on
   Cloudflare DNS). A domain bought elsewhere works too once its nameservers point at Cloudflare.
2. **Zero Trust:** Cloudflare dashboard → Zero Trust → pick a team name, Free plan. It may ask for a
   card even on the free plan.
3. **Tunnel:** Zero Trust → Networks → Tunnels → Create → *Cloudflared* → Windows. It shows a
   one-line install command with a token. Run it once in an admin PowerShell on the mini PC.
   That installs `cloudflared` as a Windows service, so it starts on boot.
4. **Access policy (do this before adding any hostnames):** Zero Trust → Access → Applications →
   Add → Self-hosted:
   - Domain: `*.<yourdomain>` (and `<yourdomain>` if the bare domain is used)
   - Policy: Allow, Include → Emails → your email
   - Login method: One-time PIN (default), and optionally add Google
   - Session duration: 1 month, the longest, so the phone rarely asks again

## Adding an app (fieldtime first)

1. On the mini PC, clone to `C:\Apps\fieldtime`, then `npm install` and `npm run build`.
2. Try it: `PORT=8080 npm start` → open `http://localhost:8080`.
3. **Auto-start:** Task Scheduler → Create Task "fieldtime":
   - Trigger: At startup. Run whether user is logged on or not.
   - Action: `node` with arguments `--import tsx packages/server/src/index.ts`, start in
     `C:\Apps\fieldtime`
   - Environment: set `PORT=8080` with a small `start.cmd` wrapper
   - Settings: restart on failure every 1 minute
4. **Tunnel hostname:** Zero Trust → Tunnels → your tunnel → Public hostnames → Add:
   `fieldtime.<yourdomain>` → `http://localhost:8080`.
5. Open `https://fieldtime.<yourdomain>` from anywhere → email code → the app.
6. iPhone: open that address in Safari, sign in once, then Share → Add to Home Screen.

**Updating an app:** in `C:\Apps\<app>`, `git pull`, `npm install`, `npm run build`, then restart
its scheduled task. Claude can do this when asked.

## Things to know

- **Live sync through the tunnel:** Cloudflare drops connections that are idle for 100 s. The
  server's SSE ping every 25 s keeps them open.
- **When the Access session expires** (monthly), the app's background calls fail until the page
  is reloaded and you sign in again. The outbox holds any changes made meanwhile, so nothing is
  lost. If the installed iPhone PWA handles the sign-in redirect badly, there are two fallbacks:
  point the phone at the Tailscale address instead, or add an in-app login to fieldtime and
  exempt its hostname from Access.
- **On the home network the app is still open** at `http://<minipc>:8080` without a login.
  That's fine for a home LAN. The API token planned in DESIGN.md §9 closes it if that ever
  matters.
- **Backups:** nightly `VACUUM INTO` copy of each app's DB to OneDrive (still to be built, see
  CLAUDE.md, Status).

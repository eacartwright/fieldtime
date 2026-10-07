# Hosting apps from home

> The concrete steps for this setup (mini PC, `fieldtime.evans.tools`) are in
> [deploy-evans-tools.md](deploy-evans-tools.md). This page explains the approach.

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
 mini PC: cloudflared ──▶ 127.0.0.1:8080  Caddy: evans.tools landing page (public)
                     ├──▶ 127.0.0.1:8081  fieldtime
                     └──▶ 127.0.0.1:8082  next app …
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
| Port | 8080 Caddy (landing page), fieldtime **8081**, next app 8082, … (dev ports 5173/8787 stay separate). Point the tunnel at `127.0.0.1`, not `localhost`: Caddy also listens on IPv6 `::1`. |
| Address | `https://<app>.<yourdomain>` |
| Auto-start | Task Scheduler task "<app>", at system startup, whether signed in or not |
| Data | inside `C:\Apps\<app>\data`, backed up daily |
| Settings | `C:\Apps\<app>\.env` (git-ignored), written by the install script |

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

1. On the mini PC, install **Git** and **Node LTS** (no C++ build tools needed; the database
   is Node's built-in SQLite), and sign in to OneDrive.
2. Clone the repo to `C:\Apps\fieldtime`.
3. Start → type *PowerShell* → right-click → **Run as administrator**, then:
   ```
   cd C:\Apps\fieldtime
   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Port 8081 -BackupDir <folder>
   ```
   (The exact command used on the mini PC is in [deploy-evans-tools.md](deploy-evans-tools.md).)
   That builds the app, writes `.env` (port, daily backup folder), registers the **fieldtime**
   scheduled task (at startup, as SYSTEM, whether or not anyone is signed in), opens the port on
   private networks, starts it
   and checks `/api/health`. `scripts\run.cmd` restarts the server if it ever exits; its output
   goes to `data\server.log`.
4. **Tunnel hostname:** Zero Trust → Tunnels → your tunnel → Public hostnames → Add:
   `fieldtime.<yourdomain>` → `http://127.0.0.1:8081`.
5. Open `https://fieldtime.<yourdomain>` from anywhere → email code → the app.
6. iPhone: open that address in Safari, sign in once, then Share → Add to Home Screen.

**Updating fieldtime:** push to `main` from the dev PC, then on the mini PC run
`.\scripts\update.ps1` from an admin PowerShell in `C:\Apps\fieldtime`. It pulls, installs,
builds, restarts the task and checks health. The installed iPhone app picks up the new build
on its next launch (index.html is served `no-cache`).

## Things to know

- **Live sync through the tunnel:** Cloudflare drops connections that are idle for 100 s. The
  server's SSE ping every 25 s keeps them open.
- **When the Access session expires** (monthly), the app's calls get redirected to the login.
  The app notices and the status badge turns into **Signed out · Sign in**; tapping it reloads
  through the login. The outbox holds any changes made meanwhile, so nothing is lost. If the installed iPhone PWA handles the sign-in redirect badly, there are two fallbacks:
  point the phone at the Tailscale address instead, or add an in-app login to fieldtime and
  exempt its hostname from Access.
- **On the home network the app is still open** at `http://<minipc>:8081` without a login.
  That's fine for a home LAN. The API token planned in DESIGN.md §9 closes it if that ever
  matters.
- **Backups:** the server writes `fieldtime-YYYY-MM-DD.db` (a `VACUUM INTO` snapshot) at startup
  and at the first hourly check of each new day, into `FIELDTIME_BACKUP_DIR`, keeping 30.
  `/api/health` reports the latest. To restore: stop the task, copy a backup over
  `data\fieldtime.db` (delete the `-wal`/`-shm` files next to it), start the task.

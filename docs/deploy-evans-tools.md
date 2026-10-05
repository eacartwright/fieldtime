# Runbook: fieldtime on the mini PC at fieldtime.evans.tools

The concrete version of [home-hosting.md](home-hosting.md) for this setup. Written so a Claude Code
session **on the mini PC** can follow it top to bottom with Evan.

| | |
|---|---|
| Machine | Mini PC (Intel N97, Windows 11), always on |
| Code | `C:\Apps\fieldtime`, a clone that only pulls `main` |
| Port | 8080 (localhost; the tunnel connects to it) |
| Address | **https://fieldtime.evans.tools** |
| Login | Cloudflare Access on `*.evans.tools`; the landing page at `evans.tools` stays public |
| Data | `C:\Apps\fieldtime\data\fieldtime.db`, daily backups to `OneDrive\Backups\fieldtime` |

State as of 2026-10-04: `evans.tools` is on Cloudflare DNS (nameservers `mitch`/`tina`) and serves a
public landing page. No subdomains, no tunnel, no Access app yet. The mini PC is a fresh machine.
Development happens on DEVvm; its data does **not** move here, so the real log starts empty.

Legend: **[Evan]** = needs Evan (dashboard, admin prompt, or a decision). Everything else Claude
does and checks.

## 1. Tools

1. `winget install --id Git.Git -e` and `winget install --id OpenJS.NodeJS.LTS -e`.
   **[Evan]** approve the admin prompts. Then open a new shell (PATH) and check `git --version`,
   `node -v` (must be ≥ 22.13; LTS is 24).
2. **[Evan]** Settings → System → Power: screen can sleep, but the PC **never sleeps**.
3. **[Evan]** Sign in to OneDrive (for backups) if it isn't already.

## 2. Code and build

```powershell
git clone https://github.com/eacartwright/fieldtime C:\Apps\fieldtime
cd C:\Apps\fieldtime
npm ci
npm test
npm run build
```

No C++ build tools are needed (the database is Node's built-in `node:sqlite`). If `npm` is refused
in PowerShell ("running scripts is disabled"): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 3. Install the always-on server

**[Evan]** Start → type *PowerShell* → right-click → **Run as administrator**, then:

```powershell
cd C:\Apps\fieldtime
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

It writes `.env` (port 8080, backups to OneDrive), registers the **fieldtime** scheduled task
(at startup, as SYSTEM, signed in or not; `scripts\run.cmd` restarts the server if it exits),
opens port 8080 on private networks, starts it, and ends with
`fieldtime is up on http://localhost:8080 (rev …, last backup: fieldtime-YYYY-MM-DD.db)`.

Check: `Invoke-RestMethod http://localhost:8080/api/health` → `ok: True` and a `lastBackup`.
Logs: `C:\Apps\fieldtime\data\server.log`.

## 4. Cloudflare (all [Evan], in the dashboard; Claude reads the steps out)

**4a. Zero Trust, once.** dash.cloudflare.com → **Zero Trust**. Pick a team name, Free plan (it
may ask for a card).

**4b. The login first, before anything is public.** Zero Trust → **Access → Applications → Add
an application → Self-hosted**:
- Application name: `evans.tools apps`
- Session duration: **1 month**
- Public hostname: subdomain `*`, domain `evans.tools`. (Not the bare domain: the landing page
  stays public.)
- Policy: name `Evan`, action **Allow**, Include → **Emails** → Evan's email address.
- Login methods: **One-time PIN** (default); add Google if wanted.
- Save.

**4c. The tunnel.** Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**, name
`minipc`. Choose **Windows**. The page shows an install command ending in a long token.
- Install cloudflared: `winget install --id Cloudflare.cloudflared -e`
- In an **admin** PowerShell: `cloudflared.exe service install <TOKEN>` (the token from the page;
  Evan pastes it there, it's a secret, don't save it in the repo).
- The dashboard should show the connector as **Healthy**. Claude can check the service:
  `Get-Service cloudflared` → Running.

**4d. The hostname.** In the tunnel → **Public hostnames → Add a public hostname**:
subdomain `fieldtime`, domain `evans.tools`, service type **HTTP**, URL `localhost:8080`. Save.

## 5. Verify

- Claude: `Invoke-WebRequest https://fieldtime.evans.tools -MaximumRedirection 0` should answer
  **302 to `*.cloudflareaccess.com`** (proves the login is in front). A 200 here would mean the
  app is public: stop and fix the Access app (4b).
- Claude: `https://evans.tools` should still be the public landing page (200).
- **[Evan]** Desktop browser: https://fieldtime.evans.tools → email code → the app, status
  "Synced". Start and stop a task.
- **[Evan]** iPhone: Safari → same address → sign in → **Share → Add to Home Screen**. Open it
  from the home screen: the fieldtime icon, no browser bars.

## 6. Afterwards

- **Updates:** after pushing to `main` from DEVvm, on the mini PC in an admin PowerShell:
  `cd C:\Apps\fieldtime; .\scripts\update.ps1` (pull, install, build, restart, health check).
- **Reboot test** (once): restart the mini PC, don't sign in, and load the site from the phone.
- **Restore a backup:** stop the task (`Stop-ScheduledTask fieldtime`), copy a backup over
  `data\fieldtime.db`, delete `data\fieldtime.db-wal` and `-shm`, `Start-ScheduledTask fieldtime`.
- Record anything that differed from this runbook back in this file.

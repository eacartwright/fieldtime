import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OP_TYPES, type OpEnvelope } from "@fieldtime/shared";
import { startBackups } from "./backup";
import { openDb } from "./db";
import { ConnectWiseClient, CwError, configFromEnv } from "./integrations/connectwise/client";
import { profile, seedCategories } from "./profile";
import { Store } from "./store";

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.FIELDTIME_DB ?? fileURLToPath(new URL("../../../data/fieldtime.db", import.meta.url));
const BACKUP_DIR = process.env.FIELDTIME_BACKUP_DIR ?? join(dirname(DB_FILE), "backups");
const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

const db = openDb(DB_FILE);
const store = new Store(db);
const backups = startBackups(db, BACKUP_DIR);
if (Object.keys(store.state.categories).length === 0) {
  store.seed({ groups: [], categories: seedCategories(), projects: [], tasks: [], sessions: [] });
}

// ConnectWise is optional: without the CW_* settings in .env, ticket lookup is off.
const cw = (() => {
  if (!process.env.CW_SITE) return null;
  try {
    return new ConnectWiseClient(configFromEnv());
  } catch (err) {
    console.error(`ConnectWise is off: ${(err as Error).message}`);
    return null;
  }
})();

function isOpEnvelope(x: any): x is OpEnvelope {
  return (
    x && typeof x.id === "string" && typeof x.at === "number" && x.op && OP_TYPES.has(x.op.type)
  );
}

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, rev: store.rev, lastBackup: backups.latest() }));

app.get("/api/state", (c) =>
  c.json({
    rev: store.rev,
    state: store.state,
    config: { groupLabel: profile.groupLabel, categoryLabel: profile.categoryLabel, cw: cw !== null },
  }),
);

app.get("/api/cw/tickets/:id", async (c) => {
  if (!cw) return c.json({ error: "ConnectWise isn't set up on this server" }, 503);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Not a ticket number" }, 400);
  try {
    const t = await cw.getTicket(id);
    return c.json({ id: t.id, summary: t.summary, company: t.company?.name ?? "", closed: !!t.closedFlag });
  } catch (err) {
    if (err instanceof CwError && err.status === 404) return c.json({ error: `No ticket #${id}` }, 404);
    console.error(err);
    return c.json({ error: "ConnectWise lookup failed" }, 502);
  }
});

app.post("/api/ops", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ops: unknown[] = Array.isArray(body?.ops) ? body.ops : [];
  const valid = ops.filter(isOpEnvelope);
  if (valid.length !== ops.length) return c.json({ error: "invalid op" }, 400);
  const changes = store.apply(valid);
  return c.json({ rev: store.rev, changes });
});

// Live updates: every change is pushed to every connected device.
app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    const off = store.onChange((rev, changes) => {
      void stream.writeSSE({ event: "changes", data: JSON.stringify({ rev, changes }) });
    });
    await stream.writeSSE({ event: "hello", data: JSON.stringify({ rev: store.rev }) });
    const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    clearInterval(ping);
    off();
  }),
);

// In production the server also serves the built web app.
if (existsSync(WEB_DIST)) {
  // Built assets have hashed names and never change. Everything else (index.html,
  // the manifest) must be revalidated, or the iPhone PWA keeps running an old build.
  app.use("/*", async (c, next) => {
    await next();
    c.header("Cache-Control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  });
  app.use("/*", serveStatic({ root: WEB_DIST }));
  app.get("*", serveStatic({ path: `${WEB_DIST}/index.html` }));
}

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`fieldtime server on http://localhost:${info.port}  (db: ${DB_FILE}, backups: ${BACKUP_DIR})`);
});

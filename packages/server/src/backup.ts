import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./db";

// Daily copy of the database. VACUUM INTO writes a consistent, compact snapshot
// even while the server is running. The first check after midnight (or at startup)
// makes that day's file, so it holds everything up to the end of the previous day.

const KEEP = 30;
const FILE = /^fieldtime-\d{4}-\d{2}-\d{2}\.db$/;

const pad = (n: number) => n.toString().padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function startBackups(db: DB, dir: string) {
  mkdirSync(dir, { recursive: true });
  const list = () => readdirSync(dir).filter((f) => FILE.test(f)).sort();

  const run = () => {
    const file = join(dir, `fieldtime-${localDate(new Date())}.db`);
    if (existsSync(file)) return;
    try {
      db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
      for (const old of list().slice(0, -KEEP)) rmSync(join(dir, old));
      console.log(`backup: ${file}`);
    } catch (err) {
      console.error("backup failed:", err);
    }
  };

  run();
  setInterval(run, 60 * 60_000).unref();
  return { latest: () => list().at(-1) ?? null };
}

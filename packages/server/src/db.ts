import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_SETTINGS, type Category, type Changes, type Group, type Session, type Settings, type State, type Task } from "@fieldtime/shared";

// SQLite persistence. Plain tables with one row per entity, so the file stays
// readable in any SQLite browser. Schema changes go in MIGRATIONS, in order.

const MIGRATIONS: string[] = [
  `
  CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    rev INTEGER NOT NULL
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    group_id TEXT,
    ref TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    rev INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    start INTEGER NOT NULL,
    "end" INTEGER,
    deduct_min INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    updated_at INTEGER NOT NULL,
    rev INTEGER NOT NULL
  );
  CREATE INDEX sessions_task ON sessions(task_id);
  CREATE INDEX sessions_start ON sessions(start);
  -- Every op the server has applied, for idempotency and as an audit trail.
  CREATE TABLE ops (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // Sessions merged away or discarded as blips are flagged rather than removed, so the change syncs.
  `ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;`,
  // When a session was marked as entered into the external system (CW).
  `ALTER TABLE sessions ADD COLUMN entered_at INTEGER;`,
  // Paused tasks stay on the Now stack until stopped.
  `ALTER TABLE tasks ADD COLUMN paused_at INTEGER;`,
  // Edited after being marked entered: the external entry needs fixing too.
  `ALTER TABLE sessions ADD COLUMN changed_since_entered INTEGER NOT NULL DEFAULT 0;`,
];

export type DB = DatabaseSync;

export function openDb(file: string): DB {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

/** Run `fn` in a write transaction; rolls back if it throws. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getRev(db: DB): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'rev'").get() as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

export function setRev(db: DB, rev: number) {
  db.prepare("INSERT INTO meta (key, value) VALUES ('rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    String(rev),
  );
}

export function loadState(db: DB): State {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'settings'").get() as { value: string } | undefined;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<Settings>) : {}) };
  const state: State = { groups: {}, categories: {}, tasks: {}, sessions: {}, settings };
  for (const r of db.prepare("SELECT * FROM groups").all() as any[]) {
    state.groups[r.id] = {
      id: r.id,
      name: r.name,
      archived: !!r.archived,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      rev: r.rev,
    };
  }
  for (const r of db.prepare("SELECT * FROM categories").all() as any[]) {
    state.categories[r.id] = { id: r.id, name: r.name, position: r.position, archived: !!r.archived, rev: r.rev };
  }
  for (const r of db.prepare("SELECT * FROM tasks").all() as any[]) {
    state.tasks[r.id] = {
      id: r.id,
      title: r.title,
      groupId: r.group_id,
      ref: r.ref,
      description: r.description,
      status: r.status,
      pausedAt: r.paused_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      rev: r.rev,
    };
  }
  for (const r of db.prepare("SELECT * FROM sessions").all() as any[]) {
    state.sessions[r.id] = {
      id: r.id,
      taskId: r.task_id,
      start: r.start,
      end: r.end,
      deductMin: r.deduct_min,
      notes: r.notes,
      categoryId: r.category_id,
      enteredAt: r.entered_at,
      changedSinceEntered: !!r.changed_since_entered,
      deleted: !!r.deleted,
      updatedAt: r.updated_at,
      rev: r.rev,
    };
  }
  return state;
}

export function saveChanges(db: DB, c: Changes) {
  const g = db.prepare(`INSERT OR REPLACE INTO groups (id, name, archived, created_at, updated_at, rev)
    VALUES (@id, @name, @archived, @createdAt, @updatedAt, @rev)`);
  const cat = db.prepare(`INSERT OR REPLACE INTO categories (id, name, position, archived, rev)
    VALUES (@id, @name, @position, @archived, @rev)`);
  const t = db.prepare(`INSERT OR REPLACE INTO tasks (id, title, group_id, ref, description, status, paused_at, created_at, updated_at, rev)
    VALUES (@id, @title, @groupId, @ref, @description, @status, @pausedAt, @createdAt, @updatedAt, @rev)`);
  const s = db.prepare(`INSERT OR REPLACE INTO sessions (id, task_id, start, "end", deduct_min, notes, category_id, entered_at, changed_since_entered, deleted, updated_at, rev)
    VALUES (@id, @taskId, @start, @end, @deductMin, @notes, @categoryId, @enteredAt, @changedSinceEntered, @deleted, @updatedAt, @rev)`);
  for (const x of c.groups) g.run({ ...x, archived: x.archived ? 1 : 0 } satisfies Record<keyof Group, unknown>);
  for (const x of c.categories) cat.run({ ...x, archived: x.archived ? 1 : 0 } satisfies Record<keyof Category, unknown>);
  for (const x of c.tasks) t.run({ ...x, pausedAt: x.pausedAt ?? null } satisfies Task);
  if (c.settings) {
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(JSON.stringify(c.settings));
  }
  for (const x of c.sessions) {
    s.run({
      ...x,
      enteredAt: x.enteredAt ?? null,
      changedSinceEntered: x.changedSinceEntered ? 1 : 0,
      deleted: x.deleted ? 1 : 0,
    } satisfies Record<keyof Session, unknown>);
  }
}

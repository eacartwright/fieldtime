import {
  applyOp,
  collectChanges,
  newTouched,
  type Changes,
  type OpEnvelope,
  type State,
} from "@sideshow/shared";
import { getRev, loadState, saveChanges, setRev, transaction, type DB } from "./db";

// The authoritative state: held in memory, persisted to SQLite on every change.

export class Store {
  state: State;
  rev: number;
  private listeners = new Set<(rev: number, changes: Changes) => void>();

  constructor(private db: DB) {
    this.state = loadState(db);
    this.rev = getRev(db);
  }

  onChange(fn: (rev: number, changes: Changes) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Apply a batch of ops. Ops already applied (same id) are skipped. */
  apply(ops: OpEnvelope[]): Changes {
    const seen = this.db.prepare("SELECT 1 FROM ops WHERE id = ?");
    const record = this.db.prepare("INSERT INTO ops (id, at, received_at, body) VALUES (?, ?, ?, ?)");
    const touched = newTouched();
    let changes: Changes;

    try {
      transaction(this.db, () => {
        for (const env of ops) {
          if (seen.get(env.id)) continue;
          applyOp(this.state, env, touched);
          record.run(env.id, env.at, Date.now(), JSON.stringify(env.op));
        }
        changes = collectChanges(this.state, touched);
        const all: { rev: number }[] = [...changes.lists, ...changes.projects, ...changes.tasks, ...changes.sessions];
        if (changes.settings) all.push(changes.settings);
        if (all.length) {
          this.rev += 1;
          for (const e of all) e.rev = this.rev;
          saveChanges(this.db, changes);
          setRev(this.db, this.rev);
        }
      });
    } catch (err) {
      // The in-memory state may be ahead of the database now; resync from disk.
      this.state = loadState(this.db);
      this.rev = getRev(this.db);
      throw err;
    }

    const c = changes!;
    if (c.lists.length || c.projects.length || c.tasks.length || c.sessions.length || c.settings) {
      for (const fn of this.listeners) fn(this.rev, c);
    }
    return c;
  }

  /** Insert entities directly (seeding), bypassing ops. */
  seed(changes: Changes) {
    transaction(this.db, () => {
      this.rev += 1;
      for (const e of [...changes.lists, ...changes.projects, ...changes.tasks, ...changes.sessions]) e.rev = this.rev;
      saveChanges(this.db, changes);
      setRev(this.db, this.rev);
    });
    for (const x of changes.lists) this.state.lists[x.id] = x;
    for (const x of changes.projects) this.state.projects[x.id] = x;
    for (const x of changes.tasks) this.state.tasks[x.id] = x;
    for (const x of changes.sessions) this.state.sessions[x.id] = x;
  }
}

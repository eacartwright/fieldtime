import {
  applyOp,
  emptyState,
  newId,
  type Changes,
  type Id,
  type Op,
  type OpEnvelope,
  type State,
} from "@fieldtime/shared";

// Client side of sync. What the UI shows is always:
//   the last state confirmed by the server + ops not yet confirmed, replayed on top.
// Ops are written to localStorage before anything is sent, so a dropped
// connection or closed tab never loses them. Everything is instant locally.

export interface Config {
  groupLabel: string;
  categoryLabel: string;
}

export type Connection = "connecting" | "online" | "offline";

export interface Snapshot {
  view: State;
  config: Config;
  loaded: boolean;
  connection: Connection;
  pending: number;
}

const CACHE_KEY = "fieldtime:cache";
const PENDING_KEY = "fieldtime:pending";
const KINDS = ["groups", "categories", "tasks", "sessions"] as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the server still has everything confirmed */
  }
}

class Sync {
  private server: State = emptyState();
  private rev = 0;
  private config: Config = { groupLabel: "Client", categoryLabel: "Work Type" };
  private loaded = false;
  private pending: OpEnvelope[] = [];
  private inflight = new Set<Id>();
  private connection: Connection = "connecting";
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 1000;
  private cacheTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;

  constructor() {
    const cache = read<{ server: State; rev: number; config: Config }>(CACHE_KEY);
    if (cache) {
      this.server = cache.server;
      this.rev = cache.rev;
      this.config = cache.config;
      this.loaded = true;
    }
    this.pending = read<OpEnvelope[]>(PENDING_KEY) ?? [];
    this.snapshot = this.build();
  }

  start() {
    void this.fetchState();
    this.listen();
    window.addEventListener("online", () => this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void this.fetchState();
        this.flush();
      }
    });
    this.flush();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  dispatch(op: Op, flushDelay = 0): OpEnvelope {
    const env: OpEnvelope = { id: newId(), at: Date.now(), op };
    const last = this.pending[this.pending.length - 1];
    // Typing produces a stream of updates to the same field; keep only the latest unsent one.
    if (last && !this.inflight.has(last.id) && sameTarget(last.op, op)) {
      this.pending[this.pending.length - 1] = env;
    } else {
      this.pending.push(env);
    }
    write(PENDING_KEY, this.pending);
    this.recompute();
    this.scheduleFlush(flushDelay);
    return env;
  }

  private build(): Snapshot {
    const view = structuredClone(this.server);
    for (const env of this.pending) applyOp(view, env);
    return {
      view,
      config: this.config,
      loaded: this.loaded,
      connection: this.connection,
      pending: this.pending.length,
    };
  }

  private recompute() {
    this.snapshot = this.build();
    for (const fn of this.listeners) fn();
  }

  private setConnection(c: Connection) {
    if (this.connection === c) return;
    this.connection = c;
    this.recompute();
  }

  private merge(changes: Changes) {
    for (const kind of KINDS) {
      const rec = this.server[kind] as Record<Id, { rev: number }>;
      for (const e of changes[kind]) {
        const existing = rec[e.id];
        if (!existing || e.rev >= existing.rev) rec[e.id] = e;
      }
    }
  }

  private saveCache() {
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(
      () => write(CACHE_KEY, { server: this.server, rev: this.rev, config: this.config }),
      500,
    );
  }

  private async fetchState() {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { state: State; rev: number; config: Config };
      this.server = body.state;
      this.rev = body.rev;
      this.config = body.config;
      this.loaded = true;
      this.saveCache();
      this.recompute();
    } catch {
      this.setConnection("offline");
    }
  }

  private listen() {
    const es = new EventSource("/api/events");
    es.addEventListener("hello", (e) => {
      this.setConnection("online");
      const { rev } = JSON.parse((e as MessageEvent).data) as { rev: number };
      if (rev !== this.rev) void this.fetchState();
      this.flush();
    });
    es.addEventListener("changes", (e) => {
      const { rev, changes } = JSON.parse((e as MessageEvent).data) as { rev: number; changes: Changes };
      this.merge(changes);
      this.rev = Math.max(this.rev, rev);
      this.saveCache();
      this.recompute();
    });
    // EventSource reconnects on its own; "hello" on reconnect catches us up.
    es.onerror = () => this.setConnection("offline");
  }

  private scheduleFlush(delay: number) {
    if (delay === 0) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        this.flush();
      }, delay);
    }
  }

  private async flush() {
    if (this.inflight.size || !this.pending.length) return;
    const batch = this.pending.slice();
    for (const env of batch) this.inflight.add(env.id);
    try {
      const res = await fetch("/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ops: batch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { rev: number; changes: Changes };
      this.merge(body.changes);
      this.rev = Math.max(this.rev, body.rev);
      const sent = new Set(batch.map((b) => b.id));
      this.pending = this.pending.filter((p) => !sent.has(p.id));
      write(PENDING_KEY, this.pending);
      this.saveCache();
      this.retryDelay = 1000;
      this.inflight.clear();
      this.setConnection("online");
      this.recompute();
      if (this.pending.length) this.flush();
    } catch {
      this.inflight.clear();
      this.setConnection("offline");
      const delay = this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
      setTimeout(() => this.flush(), delay);
    }
  }
}

function sameKeys(a: object, b: object) {
  return Object.keys(a).sort().join() === Object.keys(b).sort().join();
}

function sameTarget(a: Op, b: Op): boolean {
  if (a.type === "session.update" && b.type === "session.update")
    return a.sessionId === b.sessionId && sameKeys(a.patch, b.patch);
  if (a.type === "task.update" && b.type === "task.update")
    return a.taskId === b.taskId && sameKeys(a.patch, b.patch) && !("status" in b.patch);
  return false;
}

export const sync = new Sync();

import type { OpEnvelope } from "./ops";
import type { Changes, Id, Ms, Session, State } from "./types";

// The single reducer used by both client (optimistic) and server (authoritative).
// It mutates `state` in place and records which entities it touched.
//
// Rules:
// - Several tasks may run at once, but each task has at most one open session.
// - Starting in "switch" mode stops everything else; "alongside" leaves it running.
// - Coming back to a task within RESUME_GAP of its last session reopens that
//   session instead of adding a new fragment.
// - A session under SHORT_SESSION with no notes is discarded when it ends,
//   unless it's the task's only session.
//
// Start/stop use timeline semantics (what was running *at the op's time*), so an
// op that reaches the server late because the phone had no signal still lands
// where it happened.

export const SHORT_SESSION_MS = 30_000;
export const RESUME_GAP_MS = 10 * 60_000;

export interface Touched {
  groups: Set<Id>;
  categories: Set<Id>;
  tasks: Set<Id>;
  sessions: Set<Id>;
}

export function newTouched(): Touched {
  return { groups: new Set(), categories: new Set(), tasks: new Set(), sessions: new Set() };
}

export function collectChanges(state: State, t: Touched): Changes {
  const pick = <T>(rec: Record<Id, T>, ids: Set<Id>) =>
    [...ids].map((id) => rec[id]).filter((x): x is T => x !== undefined);
  return {
    groups: pick(state.groups, t.groups),
    categories: pick(state.categories, t.categories),
    tasks: pick(state.tasks, t.tasks),
    sessions: pick(state.sessions, t.sessions),
  };
}

export function liveSessions(state: State): Session[] {
  return Object.values(state.sessions).filter((s) => !s.deleted);
}

/** Sessions whose time range covers `t` (start inclusive, end exclusive). */
export function sessionsAt(state: State, t: Ms): Session[] {
  return liveSessions(state).filter((s) => s.start <= t && (s.end === null || s.end > t));
}

export function openSessions(state: State): Session[] {
  return liveSessions(state).filter((s) => s.end === null);
}

function taskSessions(state: State, taskId: Id): Session[] {
  return liveSessions(state)
    .filter((s) => s.taskId === taskId)
    .sort((a, b) => a.start - b.start);
}

function nextStartAfter(state: State, t: Ms): Ms | null {
  let next: Ms | null = null;
  for (const s of liveSessions(state)) {
    if (s.start > t && (next === null || s.start < next)) next = s.start;
  }
  return next;
}

/** Work type carries over from the task's most recent earlier session. */
function inheritedCategory(state: State, taskId: Id, before: Ms): Id | null {
  let best: Session | undefined;
  for (const s of taskSessions(state, taskId)) {
    if (s.start < before && s.categoryId) best = s;
  }
  return best?.categoryId ?? null;
}

function endSession(state: State, s: Session, at: Ms, t: Touched) {
  s.end = Math.max(at, s.start);
  s.updatedAt = at;
  t.sessions.add(s.id);
  // Discard blips: a few seconds on a task that already has other time, with nothing written.
  if (s.end - s.start < SHORT_SESSION_MS && !s.notes.trim() && taskSessions(state, s.taskId).length > 1) {
    s.deleted = true;
  }
}

export function applyOp(state: State, env: OpEnvelope, t: Touched = newTouched()): Touched {
  const { op, at } = env;

  switch (op.type) {
    case "task.start": {
      if (state.sessions[op.sessionId]) break; // already applied

      let task = state.tasks[op.taskId];
      if (!task) {
        if (!op.newTask) break; // continuing a task we don't know about
        task = {
          id: op.taskId,
          title: op.newTask.title,
          groupId: op.newTask.groupId,
          ref: "",
          description: "",
          status: "open",
          createdAt: at,
          updatedAt: at,
          rev: 0,
        };
        state.tasks[task.id] = task;
        t.tasks.add(task.id);
      } else if (task.status !== "open") {
        task.status = "open";
        task.updatedAt = at;
        t.tasks.add(task.id);
      }
      const taskId = task.id;

      const covering = sessionsAt(state, at);
      const others = covering.filter((s) => s.taskId !== taskId);
      const mode = op.mode ?? "switch";

      // How long the new stretch runs. Normally until stopped (null). For a late
      // switch, until whatever it interrupted would have ended, or until the next thing started.
      let end: Ms | null = null;
      if (mode === "switch") {
        if (others.length) end = others.some((s) => s.end === null) ? null : Math.max(...others.map((s) => s.end!));
        else end = nextStartAfter(state, at);
        for (const s of others) endSession(state, s, at, t);
      }
      if (covering.some((s) => s.taskId === taskId)) break; // already running then

      const own = taskSessions(state, taskId);
      const laterOwn = own.find((s) => s.start > at);
      if (laterOwn && (end === null || end > laterOwn.start)) end = laterOwn.start;

      // Back on it shortly after stopping: keep going in the same session.
      const prev = [...own].reverse().find((s) => s.start <= at);
      if (prev && prev.end !== null && at - prev.end <= RESUME_GAP_MS) {
        prev.end = end;
        prev.updatedAt = at;
        t.sessions.add(prev.id);
        break;
      }

      state.sessions[op.sessionId] = {
        id: op.sessionId,
        taskId,
        start: at,
        end,
        deductMin: 0,
        notes: "",
        categoryId: inheritedCategory(state, taskId, at),
        deleted: false,
        updatedAt: at,
        rev: 0,
      };
      t.sessions.add(op.sessionId);
      break;
    }

    case "timer.stop": {
      if (op.sessionId) {
        const s = state.sessions[op.sessionId];
        if (s && !s.deleted && s.start <= at && (s.end === null || s.end > at)) endSession(state, s, at, t);
      } else {
        for (const s of sessionsAt(state, at)) endSession(state, s, at, t);
      }
      break;
    }

    case "task.create": {
      if (state.tasks[op.taskId]) break;
      state.tasks[op.taskId] = {
        id: op.taskId,
        title: op.title,
        groupId: op.groupId,
        ref: "",
        description: "",
        status: "open",
        createdAt: at,
        updatedAt: at,
        rev: 0,
      };
      t.tasks.add(op.taskId);
      break;
    }

    case "task.update": {
      const task = state.tasks[op.taskId];
      if (!task) break;
      Object.assign(task, op.patch, { updatedAt: at });
      t.tasks.add(task.id);
      // Finishing or archiving a task stops its clock.
      if (op.patch.status && op.patch.status !== "open") {
        for (const s of openSessions(state)) if (s.taskId === task.id) endSession(state, s, at, t);
      }
      break;
    }

    case "session.update": {
      const s = state.sessions[op.sessionId];
      if (!s || s.deleted) break;
      const patch = { ...op.patch };
      // Never give a task two open sessions.
      if (patch.end === null && s.end !== null && openSessions(state).some((o) => o.taskId === s.taskId)) {
        delete patch.end;
      }
      Object.assign(s, patch, { updatedAt: at });
      if (s.end !== null && s.end < s.start) s.end = s.start;
      t.sessions.add(s.id);
      break;
    }

    case "session.merge": {
      const list = op.sessionIds
        .map((id) => state.sessions[id])
        .filter((s): s is Session => !!s && !s.deleted)
        .sort((a, b) => a.start - b.start);
      if (list.length < 2 || list.some((s) => s.taskId !== list[0]!.taskId)) break;
      const [target, ...rest] = list as [Session, ...Session[]];
      target.end = list.some((s) => s.end === null) ? null : Math.max(...list.map((s) => s.end!));
      // Empty notes are "continuation of previous work": nothing to carry over.
      target.notes = list
        .map((s) => s.notes.trim())
        .filter(Boolean)
        .join("\n");
      target.deductMin = list.reduce((sum, s) => sum + s.deductMin, 0);
      target.categoryId = list.find((s) => s.categoryId)?.categoryId ?? null;
      target.updatedAt = at;
      t.sessions.add(target.id);
      for (const s of rest) {
        s.deleted = true;
        s.updatedAt = at;
        t.sessions.add(s.id);
      }
      break;
    }

    case "group.create": {
      if (state.groups[op.groupId]) break;
      state.groups[op.groupId] = {
        id: op.groupId,
        name: op.name,
        archived: false,
        createdAt: at,
        updatedAt: at,
        rev: 0,
      };
      t.groups.add(op.groupId);
      break;
    }

    case "group.update": {
      const g = state.groups[op.groupId];
      if (!g) break;
      Object.assign(g, op.patch, { updatedAt: at });
      t.groups.add(g.id);
      break;
    }
  }
  return t;
}

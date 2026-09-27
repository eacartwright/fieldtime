import { liveSessions } from "./reducer";
import type { Id, Ms, Session, State, Task } from "./types";

// Read-only views over State. Nothing here is stored.

export const MINUTE = 60_000;

export function sessionsByTask(state: State): Map<Id, Session[]> {
  const map = new Map<Id, Session[]>();
  for (const s of liveSessions(state)) {
    const list = map.get(s.taskId);
    if (list) list.push(s);
    else map.set(s.taskId, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start);
  return map;
}

export function durationMs(s: Session, now: Ms): Ms {
  return Math.max(0, (s.end ?? now) - s.start - s.deductMin * MINUTE);
}

/** First meaningful line of some notes, without list/heading markers. */
export function firstLine(notes: string, max = 80): string {
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:(?:[-*•>]|#+|\d+[.)]|\[[ xX]\])\s*)*/, "").trim();
    if (line) return line.length > max ? `${line.slice(0, max - 1)}…` : line;
  }
  return "";
}

/**
 * What to call a task. Its own title if set, otherwise the first line of its
 * earliest notes, otherwise "Untitled · 10:42".
 */
export function displayTitle(task: Task, sessions: Session[] = []): { text: string; derived: boolean } {
  if (task.title.trim()) return { text: task.title.trim(), derived: false };
  for (const s of sessions) {
    const line = firstLine(s.notes);
    if (line) return { text: line, derived: true };
  }
  const when = new Date(sessions[0]?.start ?? task.createdAt);
  const hm = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return { text: `Untitled · ${hm}`, derived: true };
}

/** Recency for sorting: the last time the task was started, or when it was created. */
export function lastTouchedAt(task: Task, sessions: Session[] = []): Ms {
  const last = sessions[sessions.length - 1];
  return Math.max(task.createdAt, last?.start ?? 0);
}

export function isInbox(task: Task, sessions: Session[] = []): boolean {
  return task.status === "open" && sessions.length === 0;
}

export function startOfDay(t: Ms): Ms {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Milliseconds of a session that fall within [from, to). */
export function overlapMs(s: Session, from: Ms, to: Ms, now: Ms): Ms {
  const a = Math.max(s.start, from);
  const b = Math.min(s.end ?? now, to);
  return Math.max(0, b - a);
}

/** Every whitespace-separated term must appear somewhere in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => h.includes(term));
}

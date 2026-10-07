import {
  displayTitle,
  durationMs,
  isInbox,
  lastTouchedAt,
  newId,
  openSessions,
  overlapMs,
  sessionsByTask,
  settingsOf,
  startOfDay,
  ticketNumber,
  type Group,
  type Id,
  type Session,
  type SessionPatch,
  type Settings,
  type State,
  type Task,
  type TaskPatch,
} from "@fieldtime/shared";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, SignedOut, sync, type Snapshot } from "./sync";
import { showToast } from "./toast";

// Everything the UI reads (derived from the synced state) and every action it can take.

export interface TaskInfo {
  task: Task;
  sessions: Session[];
  title: string;
  titleDerived: boolean;
  group: Group | undefined;
  lastTouched: number;
  inbox: boolean;
  /** Lowercased text searched by the switcher. */
  haystack: string;
}

export interface Model extends Snapshot {
  tasks: Map<Id, TaskInfo>;
  /** Non-archived tasks, most recently touched first. */
  recent: TaskInfo[];
  /** Running sessions, the one most recently started on this device first. */
  running: Session[];
  /** Paused tasks (clock stopped, still on the Now stack), most recently paused first. */
  paused: TaskInfo[];
  groups: Group[];
  categories: { id: Id; name: string }[];
  settings: Settings;
}

// Task ids in the order they were started on this device, most recent first.
// Decides which running card is on top (and so which notes field gets focus).
const activation: Id[] = [];
function activate(taskId: Id) {
  const i = activation.indexOf(taskId);
  if (i >= 0) activation.splice(i, 1);
  activation.unshift(taskId);
}

function derive(snap: Snapshot): Model {
  const v: State = snap.view;
  const byTask = sessionsByTask(v);
  const tasks = new Map<Id, TaskInfo>();
  for (const task of Object.values(v.tasks)) {
    const sessions = byTask.get(task.id) ?? [];
    const { text, derived } = displayTitle(task, sessions);
    const group = task.groupId ? v.groups[task.groupId] : undefined;
    tasks.set(task.id, {
      task,
      sessions,
      title: text,
      titleDerived: derived,
      group,
      lastTouched: lastTouchedAt(task, sessions),
      inbox: isInbox(task, sessions),
      haystack: [text, task.title, group?.name, task.ref, task.description, ...sessions.map((s) => s.notes)]
        .filter(Boolean)
        .join("\n")
        .toLowerCase(),
    });
  }
  const recent = [...tasks.values()]
    .filter((t) => t.task.status !== "archived")
    .sort((a, b) => b.lastTouched - a.lastTouched);
  const rank = (s: Session) => {
    const i = activation.indexOf(s.taskId);
    return i < 0 ? Infinity : i;
  };
  const running = openSessions(v).sort((a, b) => rank(a) - rank(b) || b.start - a.start);
  const runningIds = new Set(running.map((s) => s.taskId));
  const paused = [...tasks.values()]
    .filter((t) => t.task.pausedAt && !runningIds.has(t.task.id))
    .sort((a, b) => b.task.pausedAt! - a.task.pausedAt!);
  return {
    ...snap,
    tasks,
    recent,
    running,
    paused,
    groups: Object.values(v.groups)
      .filter((g) => !g.archived)
      .sort((a, b) => a.name.localeCompare(b.name)),
    categories: Object.values(v.categories)
      .filter((c) => !c.archived)
      .sort((a, b) => a.position - b.position),
    settings: settingsOf(v),
  };
}

export function useModel(): Model {
  const snap = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  return useMemo(() => derive(snap), [snap]);
}

export function taskTotals(info: TaskInfo, now: number) {
  const dayStart = startOfDay(now);
  let total = 0;
  let today = 0;
  for (const s of info.sessions) {
    total += durationMs(s, now);
    today += overlapMs(s, dayStart, dayStart + 86_400_000, now);
  }
  return { total, today };
}

/** Re-render every `ms` milliseconds (for live timers). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// ---- actions ----

export interface Actions {
  /** ▶ New. `alongside` keeps whatever is running going. Returns the new session id. */
  startNew(title?: string, groupId?: Id | null, alongside?: boolean): Id | undefined;
  /** ▶ on an existing task. */
  continueTask(taskId: Id, alongside?: boolean): void;
  /** Stop the clock but keep the task on the Now stack; everything running if none given. */
  pause(sessionId?: Id): void;
  /** Stop a task (its running session, if any) and take it off the Now stack; everything if none given. */
  stop(target?: { sessionId?: Id; taskId?: Id }): void;
  addInbox(title: string, groupId: Id | null): void;
  updateTask(taskId: Id, patch: TaskPatch): void;
  /** Fetch the CW ticket behind the task's ref and record it. Resolves to an error message, or null. */
  lookupTicket(taskId: Id): Promise<string | null>;
  updateSession(sessionId: Id, patch: SessionPatch): void;
  mergeSessions(sessionIds: Id[]): void;
  /** Add time after the fact. Returns the new session id. */
  createSession(taskId: Id, start: number, end: number): Id;
  /** Delete a session, with an Undo toast. */
  deleteSession(sessionId: Id): void;
  createGroup(name: string): Id;
  updateSettings(patch: { blipSec?: number; resumeGapMin?: number }): void;
  /** The top running card's notes field. */
  notesRef: React.RefObject<HTMLTextAreaElement | null>;
}

const coarse = () => window.matchMedia("(pointer: coarse)").matches;

export function useActionsFactory(): Actions {
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  return useMemo<Actions>(() => {
    // The started task always lands in the top card, whose textarea stays mounted.
    // Focusing it synchronously inside the tap is what lets iOS raise the keyboard.
    const focusNotes = (force: boolean) => {
      const el = notesRef.current;
      if (!el) return;
      if (force || !coarse()) el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    return {
      notesRef,
      startNew(title = "", groupId = null, alongside = false) {
        const taskId = newId();
        const sessionId = newId();
        activate(taskId);
        focusNotes(true);
        sync.dispatch({
          type: "task.start",
          taskId,
          sessionId,
          newTask: { title, groupId },
          mode: alongside ? "alongside" : "switch",
        });
        return sessionId;
      },
      continueTask(taskId, alongside = false) {
        activate(taskId);
        focusNotes(false);
        sync.dispatch({ type: "task.start", taskId, sessionId: newId(), mode: alongside ? "alongside" : "switch" });
      },
      pause(sessionId) {
        sync.dispatch({ type: "timer.pause", sessionId });
      },
      stop(target) {
        sync.dispatch({ type: "timer.stop", ...target });
      },
      addInbox(title, groupId) {
        sync.dispatch({ type: "task.create", taskId: newId(), title, groupId });
      },
      updateTask(taskId, patch) {
        sync.dispatch({ type: "task.update", taskId, patch }, 600);
      },
      async lookupTicket(taskId) {
        const task = sync.getSnapshot().view.tasks[taskId];
        const n = task ? ticketNumber(task.ref) : "";
        if (!n) return null;
        try {
          const res = await api(`/api/cw/tickets/${n}`);
          const t = (await res.json()) as { summary: string; company: string; closed: boolean };
          // The CW company becomes the client if a client of the same name exists.
          const name = t.company.trim().toLowerCase();
          const group = Object.values(sync.getSnapshot().view.groups).find(
            (g) => !g.archived && g.name.trim().toLowerCase() === name,
          );
          sync.dispatch({
            type: "task.refInfo",
            taskId,
            ref: n,
            info: { summary: t.summary, company: t.company, closed: t.closed, fetchedAt: Date.now() },
            groupId: group?.id ?? null,
          });
          return null;
        } catch (err) {
          if (err instanceof SignedOut) return "Signed out: reload to sign in";
          const status = (err as Error).message;
          if (status === "404") return `No ticket #${n}`;
          if (status === "503") return "ConnectWise isn't set up on the server";
          return "Couldn't look it up";
        }
      },
      updateSession(sessionId, patch) {
        sync.dispatch({ type: "session.update", sessionId, patch }, 800);
      },
      mergeSessions(sessionIds) {
        sync.dispatch({ type: "session.merge", sessionIds });
      },
      createSession(taskId, start, end) {
        const sessionId = newId();
        sync.dispatch({ type: "session.create", sessionId, taskId, start, end });
        return sessionId;
      },
      deleteSession(sessionId) {
        sync.dispatch({ type: "session.delete", sessionId });
        showToast("Session deleted", {
          label: "Undo",
          run: () => sync.dispatch({ type: "session.delete", sessionId, undo: true }),
        });
      },
      createGroup(name) {
        const groupId = newId();
        sync.dispatch({ type: "group.create", groupId, name: name.trim() });
        return groupId;
      },
      updateSettings(patch) {
        sync.dispatch({ type: "settings.update", patch });
      },
    };
  }, []);
}

export const ModelContext = createContext<Model | null>(null);
export const ActionsContext = createContext<Actions | null>(null);

export const useM = () => useContext(ModelContext)!;
export const useA = () => useContext(ActionsContext)!;

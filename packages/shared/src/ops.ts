import type { Id, Ms, Project, RefInfo, Session, Settings, Task } from "./types";

// Every change to the data is an op. Clients apply ops locally right away and
// queue them for the server, which applies the same ops with the same reducer.

/**
 * How starting a task treats whatever else is running:
 * "switch" stops it (the default), "alongside" leaves it running.
 */
export type StartMode = "switch" | "alongside";

export type Op =
  /** Start working on a task, creating it first if `newTask` is given. Covers ▶ New and ▶ Continue. */
  | {
      type: "task.start";
      taskId: Id;
      sessionId: Id;
      newTask?: { title: string; groupId: Id | null; projectId?: Id | null };
      mode?: StartMode;
    }
  /**
   * Stop a session and/or a task, taking it off the Now stack (running or paused).
   * With neither, stops everything and clears every paused task.
   */
  | { type: "timer.stop"; sessionId?: Id; taskId?: Id }
  /** Stop the clock on a session but keep its task on the Now stack; everything running if no sessionId. */
  | { type: "timer.pause"; sessionId?: Id }
  /** Create a task without starting it (Inbox). */
  | { type: "task.create"; taskId: Id; title: string; groupId: Id | null; projectId?: Id | null }
  | { type: "task.update"; taskId: Id; patch: TaskPatch }
  /**
   * The result of looking up the task's ref (a CW ticket). Ignored if the ref has changed since.
   * Fills the title if the task is still untitled, and the group if it still has none.
   */
  | { type: "task.refInfo"; taskId: Id; ref: string; info: RefInfo; groupId?: Id | null }
  | { type: "session.update"; sessionId: Id; patch: SessionPatch }
  /** Add time after the fact (no timer was running). */
  | {
      type: "session.create";
      sessionId: Id;
      taskId: Id;
      start: Ms;
      end: Ms;
      categoryId?: Id | null;
      notes?: string;
    }
  /** Delete a session (a tombstone), or bring it back with `undo`. */
  | { type: "session.delete"; sessionId: Id; undo?: boolean }
  /** Combine sessions of one task into the earliest of them. */
  | { type: "session.merge"; sessionIds: Id[] }
  | { type: "group.create"; groupId: Id; name: string }
  | { type: "group.update"; groupId: Id; patch: { name?: string; archived?: boolean } }
  | { type: "project.create"; projectId: Id; title: string; parentId: Id | null }
  /** A parent that would put the project inside itself (or doesn't exist) is ignored. */
  | { type: "project.update"; projectId: Id; patch: ProjectPatch }
  | { type: "settings.update"; patch: Partial<Pick<Settings, "blipSec" | "resumeGapMin">> };

export type TaskPatch = Partial<Pick<Task, "title" | "projectId" | "groupId" | "ref" | "description" | "status">>;
export type ProjectPatch = Partial<Pick<Project, "title" | "parentId" | "description" | "status">>;
export type SessionPatch = Partial<Pick<Session, "notes" | "categoryId" | "start" | "end" | "deductMin" | "enteredAt">>;

export const OP_TYPES: ReadonlySet<Op["type"]> = new Set([
  "task.start",
  "timer.stop",
  "timer.pause",
  "task.create",
  "task.update",
  "task.refInfo",
  "session.update",
  "session.create",
  "session.delete",
  "session.merge",
  "group.create",
  "group.update",
  "project.create",
  "project.update",
  "settings.update",
]);

export interface OpEnvelope {
  /** Unique per op; the server ignores ids it has already applied. */
  id: Id;
  /** When the user did it (client clock). Start/stop use this as the session time. */
  at: Ms;
  op: Op;
}

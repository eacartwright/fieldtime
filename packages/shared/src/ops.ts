import type { Id, Ms, Session, Task } from "./types";

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
      newTask?: { title: string; groupId: Id | null };
      mode?: StartMode;
    }
  /** Stop one session, or everything running if no sessionId is given. */
  | { type: "timer.stop"; sessionId?: Id }
  /** Create a task without starting it (Inbox). */
  | { type: "task.create"; taskId: Id; title: string; groupId: Id | null }
  | { type: "task.update"; taskId: Id; patch: TaskPatch }
  | { type: "session.update"; sessionId: Id; patch: SessionPatch }
  /** Combine sessions of one task into the earliest of them. */
  | { type: "session.merge"; sessionIds: Id[] }
  | { type: "group.create"; groupId: Id; name: string }
  | { type: "group.update"; groupId: Id; patch: { name?: string; archived?: boolean } };

export type TaskPatch = Partial<Pick<Task, "title" | "groupId" | "ref" | "description" | "status">>;
export type SessionPatch = Partial<Pick<Session, "notes" | "categoryId" | "start" | "end" | "deductMin">>;

export const OP_TYPES: ReadonlySet<Op["type"]> = new Set([
  "task.start",
  "timer.stop",
  "task.create",
  "task.update",
  "session.update",
  "session.merge",
  "group.create",
  "group.update",
]);

export interface OpEnvelope {
  /** Unique per op; the server ignores ids it has already applied. */
  id: Id;
  /** When the user did it (client clock). Start/stop use this as the session time. */
  at: Ms;
  op: Op;
}

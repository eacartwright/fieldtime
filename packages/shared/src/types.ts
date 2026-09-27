// Core data model. Job-agnostic: "group" and "category" are shown with
// configurable labels (Client / Work Type at the current job). See DESIGN.md §4–5.

export type Id = string;
/** Milliseconds since epoch. */
export type Ms = number;

export type TaskStatus = "open" | "done" | "archived";

export interface Group {
  id: Id;
  name: string;
  archived: boolean;
  createdAt: Ms;
  updatedAt: Ms;
  /** Server revision of the last change. 0 until the server has seen it. */
  rev: number;
}

export interface Category {
  id: Id;
  name: string;
  position: number;
  archived: boolean;
  rev: number;
}

export interface Task {
  id: Id;
  /** May be empty: the first line of the notes stands in until it's named. */
  title: string;
  groupId: Id | null;
  /** External reference, e.g. a ticket number. */
  ref: string;
  description: string;
  status: TaskStatus;
  createdAt: Ms;
  updatedAt: Ms;
  rev: number;
}

export interface Session {
  id: Id;
  taskId: Id;
  start: Ms;
  /** null while running. Several tasks can run at once, but each task has at most one open session. */
  end: Ms | null;
  deductMin: number;
  notes: string;
  categoryId: Id | null;
  /** Merged into another session or discarded as a blip. Kept (not removed) so the change syncs. */
  deleted?: boolean;
  updatedAt: Ms;
  rev: number;
}

export interface State {
  groups: Record<Id, Group>;
  categories: Record<Id, Category>;
  tasks: Record<Id, Task>;
  sessions: Record<Id, Session>;
}

export function emptyState(): State {
  return { groups: {}, categories: {}, tasks: {}, sessions: {} };
}

/** Entities changed by applying ops; what the server persists and broadcasts. */
export interface Changes {
  groups: Group[];
  categories: Category[];
  tasks: Task[];
  sessions: Session[];
}

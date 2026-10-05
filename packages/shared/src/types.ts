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
  /**
   * Set while the task is paused: its clock is stopped but it stays on the Now stack.
   * Cleared when it starts again or is stopped.
   */
  pausedAt?: Ms | null;
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
  /** When it was marked as entered into the external system (e.g. a CW time entry). */
  enteredAt?: Ms | null;
  /** Edited after it was marked entered, so the external entry needs fixing too. Cleared when re-marked. */
  changedSinceEntered?: boolean;
  /** Merged into another session or discarded as a blip. Kept (not removed) so the change syncs. */
  deleted?: boolean;
  updatedAt: Ms;
  rev: number;
}

/** Rules the reducer applies. Synced, so every device and the server agree. 0 turns a rule off. */
export interface Settings {
  /** A session shorter than this with no notes is discarded when it ends (unless it's the task's only one). */
  blipSec: number;
  /** Starting a task within this long of its last session reopens that session. */
  resumeGapMin: number;
  rev: number;
}

export const DEFAULT_SETTINGS: Settings = { blipSec: 30, resumeGapMin: 10, rev: 0 };

export interface State {
  groups: Record<Id, Group>;
  categories: Record<Id, Category>;
  tasks: Record<Id, Task>;
  sessions: Record<Id, Session>;
  /** Missing in states cached before settings existed; read it with settingsOf(). */
  settings?: Settings;
}

export function emptyState(): State {
  return { groups: {}, categories: {}, tasks: {}, sessions: {}, settings: { ...DEFAULT_SETTINGS } };
}

export function settingsOf(state: State): Settings {
  return state.settings ?? DEFAULT_SETTINGS;
}

/** Entities changed by applying ops; what the server persists and broadcasts. */
export interface Changes {
  groups: Group[];
  categories: Category[];
  tasks: Task[];
  sessions: Session[];
  /** Present only when the settings changed. */
  settings?: Settings | null;
}

import type { Id } from "@fieldtime/shared";
import { useRef, useState } from "react";
import { useA, useM } from "../model";
import { Dialog } from "./Dialog";
import { GroupPicker } from "./fields";

// Capture work for later without touching the clock. Stays open so several
// items ("they also mentioned the printer and the wifi") go in one after another.

export function InboxAdd({ onClose }: { onClose: () => void }) {
  const m = useM();
  const a = useA();
  const top = m.running[0];
  const runningGroup = top ? (m.tasks.get(top.taskId)?.task.groupId ?? null) : null;
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState<Id | null>(runningGroup);
  const [added, setAdded] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    a.addInbox(t, groupId);
    setAdded((xs) => [t, ...xs]);
    setTitle("");
    input.current?.focus();
  };

  return (
    <Dialog title="Add to inbox" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          ref={input}
          autoFocus
          className="search"
          value={title}
          placeholder="What needs doing?"
          aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="row-actions">
          <GroupPicker value={groupId} onChange={setGroupId} />
          <span className="spacer" />
          <button type="submit" className="btn primary" disabled={!title.trim()}>
            Add
          </button>
        </div>
      </form>
      {added.length > 0 && (
        <ul className="added">
          {added.map((t, i) => (
            <li key={i}>✓ {t}</li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

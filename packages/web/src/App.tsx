import type { Id } from "@fieldtime/shared";
import { useEffect, useRef, useState } from "react";
import { InboxAdd } from "./components/InboxAdd";
import { NowPanel } from "./components/NowPanel";
import { Switcher } from "./components/Switcher";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import { ActionsContext, ModelContext, useActionsFactory, useModel, type Model } from "./model";

type Overlay = { kind: "switcher"; alongside?: boolean } | { kind: "inbox" } | { kind: "detail"; taskId: Id } | null;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function App() {
  const model = useModel();
  const actions = useActionsFactory();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = () => setOverlay(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const lastNewTap = useRef(-Infinity);

  // Desktop keyboard shortcuts. Alt+letter works even while typing in notes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay({ kind: "switcher", alongside: e.shiftKey });
      } else if (e.key === "/" && !isTyping(e.target) && !overlay) {
        e.preventDefault();
        setOverlay({ kind: "switcher" });
      } else if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const act: Record<string, () => void> = {
          KeyN: () => {
            setOverlay(null);
            actions.startNew("", null, e.shiftKey);
          },
          KeyP: () => {
            const top = modelRef.current.running[0];
            if (top) actions.stop(top.id);
          },
          KeyI: () => setOverlay({ kind: "inbox" }),
        };
        const fn = act[e.code];
        if (fn) {
          e.preventDefault();
          fn();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, overlay]);

  return (
    <ModelContext.Provider value={model}>
      <ActionsContext.Provider value={actions}>
        <header className="app-header">
          <h1>fieldtime</h1>
          <SyncBadge model={model} />
          <nav className="actionbar" aria-label="Actions">
            <button className="btn" onClick={() => setOverlay({ kind: "switcher" })} title="Find a task (Ctrl+K)">
              <span aria-hidden>⌕</span> Find
            </button>
            <button
              className="btn primary new"
              onClick={(e) => {
                // A double tap shouldn't create two tasks.
                if (e.timeStamp - lastNewTap.current < 700) return;
                lastNewTap.current = e.timeStamp;
                actions.startNew("", null, e.shiftKey);
              }}
              title="Start a new task (Alt+N; Shift to run alongside)"
            >
              <span aria-hidden>▶</span> New
            </button>
            <button className="btn" onClick={() => setOverlay({ kind: "inbox" })} title="Add to inbox (Alt+I)">
              + Inbox
            </button>
          </nav>
        </header>

        <main className="layout">
          <NowPanel onAlongside={() => setOverlay({ kind: "switcher", alongside: true })} />
          <TaskList onOpen={(taskId) => setOverlay({ kind: "detail", taskId })} />
        </main>

        {overlay?.kind === "switcher" && <Switcher alongside={overlay.alongside} onClose={close} />}
        {overlay?.kind === "inbox" && <InboxAdd onClose={close} />}
        {overlay?.kind === "detail" && <TaskDetail taskId={overlay.taskId} onClose={close} />}
      </ActionsContext.Provider>
    </ModelContext.Provider>
  );
}

function SyncBadge({ model }: { model: Model }) {
  const { connection, pending, loaded } = model;
  let text = "Synced";
  let tone = "ok";
  if (!loaded) [text, tone] = ["Loading…", "wait"];
  else if (connection === "offline") [text, tone] = [pending ? `Offline · ${pending} unsent` : "Offline", "warn"];
  else if (pending) [text, tone] = ["Saving…", "wait"];
  return (
    <span className={`sync sync-${tone}`} role="status">
      <span className="sync-dot" aria-hidden /> {text}
    </span>
  );
}

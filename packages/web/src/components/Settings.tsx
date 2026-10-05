import { DEFAULT_SETTINGS } from "@fieldtime/shared";
import { useA, useM } from "../model";
import { Dialog } from "./Dialog";

// The reducer's tunable rules. They're synced (every device and the server must
// apply the same thresholds), so a change here applies everywhere.

const BLIP_OPTIONS = [0, 10, 30, 60, 120];
const GAP_OPTIONS = [0, 2, 5, 10, 15, 30, 60];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const m = useM();
  const a = useA();
  const { blipSec, resumeGapMin } = m.settings;

  return (
    <Dialog title="Settings" onClose={onClose} className="settings">
      <p className="muted small">These rules apply on every device.</p>

      <Setting
        label="Discard accidental starts"
        value={blipSec}
        options={BLIP_OPTIONS}
        format={(v) => (v === 0 ? "Off: keep every session" : `Under ${v < 60 ? `${v} seconds` : `${v / 60} minute${v === 60 ? "" : "s"}`}`)}
        defaultValue={DEFAULT_SETTINGS.blipSec}
        onChange={(v) => a.updateSettings({ blipSec: v })}
      >
        When a session ends this quickly and has <strong>no notes</strong>, it's thrown away, so tapping the
        wrong task doesn't leave junk entries. A task's only session is always kept, and so is anything
        you typed notes in.
      </Setting>

      <Setting
        label="Resume instead of starting a new session"
        value={resumeGapMin}
        options={GAP_OPTIONS}
        format={(v) => (v === 0 ? "Off: always a new session" : `Within ${v} minutes`)}
        defaultValue={DEFAULT_SETTINGS.resumeGapMin}
        onChange={(v) => a.updateSettings({ resumeGapMin: v })}
      >
        Coming back to a task this soon after its last session <strong>reopens that session</strong> (the
        gap counts as worked), so bouncing between tasks doesn't make a pile of tiny time entries. A
        session already marked entered is never reopened.
      </Setting>
    </Dialog>
  );
}

function Setting({
  label,
  value,
  options,
  format,
  defaultValue,
  onChange,
  children,
}: {
  label: string;
  value: number;
  options: number[];
  format: (v: number) => string;
  defaultValue: number;
  onChange: (v: number) => void;
  children: React.ReactNode;
}) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  const all = options.includes(value) ? options : [...options, value].sort((x, y) => x - y);
  return (
    <section className="setting">
      <label htmlFor={id} className="setting-label">
        {label}
      </label>
      <select id={id} className="select setting-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {all.map((v) => (
          <option key={v} value={v}>
            {format(v)}
            {v === defaultValue ? " (default)" : ""}
          </option>
        ))}
      </select>
      <p className="muted small setting-help">{children}</p>
    </section>
  );
}

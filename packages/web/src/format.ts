import { startOfDay, type Ms } from "@fieldtime/shared";

const pad = (n: number) => n.toString().padStart(2, "0");

/** 1:05:09 — for live timers. */
export function clock(ms: Ms): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 1h 05m / 25m — for totals. */
export function hm(ms: Ms): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad(m % 60)}m` : `${m}m`;
}

export function timeOfDay(t: Ms): string {
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(t: Ms, now: Ms = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(t).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** "10:42 AM" today, "Yesterday", or "Mon, Sep 28". */
export function whenLabel(t: Ms, now: Ms = Date.now()): string {
  return startOfDay(t) === startOfDay(now) ? timeOfDay(t) : dayLabel(t, now);
}

export function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
}

export function formatForCW(ms) {
  if (!ms || ms < 0) return "0.00 hrs";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const decimal = (h + m / 60).toFixed(2);
  return `${decimal} hrs (${h}h ${m}m)`;
}

export function formatTimestamp(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function formatTimeOnly(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function formatDateOnly(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Convert a timestamp to the format datetime-local inputs expect
export function toDatetimeLocal(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = n => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert a datetime-local input value back to a timestamp
export function fromDatetimeLocal(str) {
  if (!str) return null;
  return new Date(str).getTime();
}
// Backend timestamps are naive UTC strings like "2026-08-11 14:03:22.123456".
export function ago(timestamp: string): string {
  if (!timestamp) return "";
  const iso = timestamp.replace(" ", "T");
  const t = new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatTimestamp(timestamp: string): string {
  return timestamp ? timestamp.slice(0, 16).replace("T", " ") : "";
}

const WEEKDAYS: Record<string, string> = {
  "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
  "4": "Thursday", "5": "Friday", "6": "Saturday",
  SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday",
  THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

export function cronHuman(cron: string): string {
  if (!cron.trim()) return "Manual — run on demand";
  const p = cron.trim().split(/\s+/);
  if (p.length < 5) return cron;
  const [min, hour, dom, , dow] = p;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return cron;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  const day = WEEKDAYS[dow.toUpperCase()];
  if (day) return `Weekly on ${day} at ${time}`;
  if (dom !== "*") return `Monthly on day ${dom} at ${time}`;
  return `Daily at ${time}`;
}

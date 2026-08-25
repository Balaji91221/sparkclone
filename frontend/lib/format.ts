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

function time12(hour: string, min: string): string {
  const h = Number(hour);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min.padStart(2, "0")} ${period}`;
}

type Schedulable = { trigger_type: string; trigger_value: string };

// Human description covering every schedule kind the backend supports.
export function scheduleHuman(t: Schedulable): string {
  switch (t.trigger_type) {
    case "interval": {
      const s = Number(t.trigger_value) || 0;
      if (s % 3600 === 0 && s >= 3600) {
        const h = s / 3600;
        return `Every ${h === 1 ? "hour" : `${h} hours`}`;
      }
      return `Every ${Math.max(1, Math.round(s / 60))} min`;
    }
    case "date": {
      const d = new Date(t.trigger_value);
      if (Number.isNaN(d.getTime())) return "Once (invalid date)";
      return `Once on ${d.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })}`;
    }
    case "webhook":
      return "Webhook-triggered";
    case "manual":
      return "Manual — run on demand";
    default:
      return cronHuman(t.trigger_value);
  }
}

// "Next run in 12m" from an ISO timestamp; empty when absent/past.
export function nextRunIn(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = (t - Date.now()) / 1000;
  if (s <= 0) return "Next run imminent";
  if (s < 60) return "Next run in <1m";
  if (s < 3600) return `Next run in ${Math.round(s / 60)}m`;
  if (s < 86400) return `Next run in ${Math.round(s / 3600)}h`;
  return `Next run in ${Math.round(s / 86400)}d`;
}

export function cronHuman(cron: string): string {
  if (!cron.trim()) return "Manual — run on demand";
  const p = cron.trim().split(/\s+/);
  if (p.length < 5) return cron;
  const [min, hour, dom, , dow] = p;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return cron;
  const time = time12(hour, min);
  if (dow !== "*") {
    const key = dow.toUpperCase().replace(/\s/g, "");
    if (key === "MON-FRI" || key === "1-5") return `Weekdays around ${time}`;
    if (key === "SAT,SUN" || key === "6,0") return `Weekends around ${time}`;
    const days = key.split(",").map((d) => WEEKDAYS[d]);
    if (days.every(Boolean)) return `Weekly on ${days.join(", ")} around ${time}`;
    return cron;
  }
  if (dom !== "*") return `Monthly on day ${dom} around ${time}`;
  return `Daily around ${time}`;
}

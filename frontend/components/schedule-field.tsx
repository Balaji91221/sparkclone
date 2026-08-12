"use client";

import { useState } from "react";
import { inputClass } from "./ui";

// Visual schedule editor that reads and writes a 5-field cron string.
// Anything it can't represent (step values, ranges, day-of-month…) opens
// in Custom mode with the raw cron preserved.

const DAYS = [
  { cron: "SUN", chip: "S", label: "Sunday" },
  { cron: "MON", chip: "M", label: "Monday" },
  { cron: "TUE", chip: "T", label: "Tuesday" },
  { cron: "WED", chip: "W", label: "Wednesday" },
  { cron: "THU", chip: "T", label: "Thursday" },
  { cron: "FRI", chip: "F", label: "Friday" },
  { cron: "SAT", chip: "S", label: "Saturday" },
] as const;

type Schedule =
  | { kind: "manual" }
  | { kind: "daily"; time: string }
  | { kind: "weekly"; time: string; days: string[] }
  | { kind: "custom"; cron: string };

const DOW_NUMBERS: Record<string, string> = {
  "0": "SUN", "1": "MON", "2": "TUE", "3": "WED", "4": "THU", "5": "FRI", "6": "SAT", "7": "SUN",
};

function parseCron(cron: string): Schedule {
  const trimmed = cron.trim();
  if (!trimmed) return { kind: "manual" };
  const p = trimmed.split(/\s+/);
  if (p.length !== 5) return { kind: "custom", cron: trimmed };
  const [min, hour, dom, mon, dow] = p;
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour) || dom !== "*" || mon !== "*") {
    return { kind: "custom", cron: trimmed };
  }
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  if (dow === "*") return { kind: "daily", time };
  const days = dow.split(",").map((d) => DOW_NUMBERS[d] ?? d.toUpperCase());
  if (days.every((d) => DAYS.some((x) => x.cron === d))) {
    return { kind: "weekly", time, days };
  }
  return { kind: "custom", cron: trimmed };
}

function toCron(s: Schedule): string {
  switch (s.kind) {
    case "manual":
      return "";
    case "daily": {
      const [h, m] = s.time.split(":");
      return `${Number(m)} ${Number(h)} * * *`;
    }
    case "weekly": {
      const [h, m] = s.time.split(":");
      const days = DAYS.filter((d) => s.days.includes(d.cron)).map((d) => d.cron);
      return `${Number(m)} ${Number(h)} * * ${days.length ? days.join(",") : "*"}`;
    }
    case "custom":
      return s.cron;
    default: {
      const _exhaustive: never = s;
      throw new Error(`unhandled schedule: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

const selectClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground " +
  "outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type ScheduleFieldProps = { value: string; onChange: (cron: string) => void };

export function ScheduleField({ value, onChange }: ScheduleFieldProps) {
  const [schedule, setSchedule] = useState<Schedule>(() => parseCron(value));

  const update = (next: Schedule) => {
    setSchedule(next);
    onChange(toCron(next));
  };

  const setKind = (kind: string) => {
    const time = "time" in schedule ? schedule.time : "09:00";
    if (kind === "manual") update({ kind: "manual" });
    else if (kind === "daily") update({ kind: "daily", time });
    else if (kind === "weekly") {
      update({
        kind: "weekly",
        time,
        days: schedule.kind === "weekly" ? schedule.days : ["MON"],
      });
    } else update({ kind: "custom", cron: value });
  };

  const toggleDay = (day: string) => {
    if (schedule.kind !== "weekly") return;
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day];
    update({ ...schedule, days });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={schedule.kind}
          onChange={(e) => setKind(e.target.value)}
          className={selectClass}
          aria-label="Schedule frequency"
        >
          <option value="manual">Manual</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="custom">Custom (cron)</option>
        </select>

        {schedule.kind === "weekly" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">on</span>
            {DAYS.map((d) => {
              const on = schedule.days.includes(d.cron);
              return (
                <button
                  key={d.cron}
                  type="button"
                  onClick={() => toggleDay(d.cron)}
                  title={d.label}
                  aria-label={d.label}
                  aria-pressed={on}
                  className={`grid h-8 w-8 place-items-center rounded-full text-xs font-medium
                    transition ${
                      on
                        ? "bg-accent text-accent-fg"
                        : "bg-surface-2 text-muted hover:text-foreground"
                    }`}
                >
                  {d.chip}
                </button>
              );
            })}
          </div>
        ) : null}

        {schedule.kind === "daily" || schedule.kind === "weekly" ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            around
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => update({ ...schedule, time: e.target.value || "09:00" })}
              className={selectClass}
            />
          </label>
        ) : null}

        {schedule.kind === "custom" ? (
          <input
            value={schedule.cron}
            onChange={(e) => update({ kind: "custom", cron: e.target.value })}
            placeholder="30 8 * * MON,THU"
            className={`${inputClass} w-52 font-mono`}
          />
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {schedule.kind === "manual"
          ? "Runs only when you press Run now."
          : `Server timezone. Cron: ${toCron(schedule) || "—"}`}
      </p>
    </div>
  );
}

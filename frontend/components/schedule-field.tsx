"use client";

import { useState } from "react";
import type { TriggerType } from "@/lib/types";
import { inputClass } from "./ui";

// Visual schedule editor for every backend schedule kind. Reads and writes a
// {trigger_type, trigger_value} pair; cron it can't represent visually
// (step values, ranges, day-of-month…) opens in Custom mode with the raw
// cron preserved.

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
  | { kind: "custom"; cron: string }
  | { kind: "interval"; minutes: number }
  | { kind: "once"; local: string } // datetime-local input value
  | { kind: "webhook" };

export type TriggerValue = { trigger_type: TriggerType; trigger_value: string };

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

// The browser's datetime-local value carries no timezone; convert to a UTC
// instant so the backend never misreads a local wall-clock time as UTC.
function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultOnceLocal(): string {
  return isoToLocal(new Date(Date.now() + 60 * 60 * 1000).toISOString());
}

function parseTrigger(v: TriggerValue): Schedule {
  switch (v.trigger_type) {
    case "interval":
      return { kind: "interval", minutes: Math.max(1, Math.round((Number(v.trigger_value) || 60) / 60)) };
    case "date":
      return { kind: "once", local: isoToLocal(v.trigger_value) || defaultOnceLocal() };
    case "webhook":
      return { kind: "webhook" };
    case "manual":
      return { kind: "manual" };
    default:
      return parseCron(v.trigger_value);
  }
}

function toTrigger(s: Schedule): TriggerValue {
  switch (s.kind) {
    case "manual":
      return { trigger_type: "manual", trigger_value: "" };
    case "daily": {
      const [h, m] = s.time.split(":");
      return { trigger_type: "cron", trigger_value: `${Number(m)} ${Number(h)} * * *` };
    }
    case "weekly": {
      const [h, m] = s.time.split(":");
      const days = DAYS.filter((d) => s.days.includes(d.cron)).map((d) => d.cron);
      return {
        trigger_type: "cron",
        trigger_value: `${Number(m)} ${Number(h)} * * ${days.length ? days.join(",") : "*"}`,
      };
    }
    case "custom":
      return { trigger_type: "cron", trigger_value: s.cron };
    case "interval":
      return { trigger_type: "interval", trigger_value: String(Math.max(1, s.minutes) * 60) };
    case "once":
      return { trigger_type: "date", trigger_value: localToIso(s.local) };
    case "webhook":
      return { trigger_type: "webhook", trigger_value: "" };
    default: {
      const _exhaustive: never = s;
      throw new Error(`unhandled schedule: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function hint(s: Schedule): string {
  switch (s.kind) {
    case "manual":
      return "Runs only when you press Run now.";
    case "interval":
      return `Runs every ${s.minutes} minute(s), starting one interval after saving.`;
    case "once":
      return "Runs once at this local time, then the schedule disables itself.";
    case "webhook":
      return "Runs when an external service calls this task's webhook URL.";
    default:
      return `Server timezone. Cron: ${toTrigger(s).trigger_value || "—"}`;
  }
}

const selectClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground " +
  "outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type ScheduleFieldProps = { value: TriggerValue; onChange: (v: TriggerValue) => void };

export function ScheduleField({ value, onChange }: ScheduleFieldProps) {
  const [schedule, setSchedule] = useState<Schedule>(() => parseTrigger(value));

  const update = (next: Schedule) => {
    setSchedule(next);
    onChange(toTrigger(next));
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
    } else if (kind === "interval") {
      update({ kind: "interval", minutes: schedule.kind === "interval" ? schedule.minutes : 15 });
    } else if (kind === "once") {
      update({ kind: "once", local: schedule.kind === "once" ? schedule.local : defaultOnceLocal() });
    } else if (kind === "webhook") update({ kind: "webhook" });
    else update({ kind: "custom", cron: value.trigger_type === "cron" ? value.trigger_value : "" });
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
          <option value="interval">Every N minutes</option>
          <option value="once">Once, at a time</option>
          <option value="webhook">Webhook</option>
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

        {schedule.kind === "interval" ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            every
            <input
              type="number"
              min={1}
              value={schedule.minutes}
              onChange={(e) =>
                update({ kind: "interval", minutes: Math.max(1, Number(e.target.value) || 1) })
              }
              aria-label="Interval in minutes"
              className={`${selectClass} w-20`}
            />
            minutes
          </label>
        ) : null}

        {schedule.kind === "once" ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            at
            <input
              type="datetime-local"
              value={schedule.local}
              onChange={(e) => update({ kind: "once", local: e.target.value })}
              aria-label="Run once at"
              className={selectClass}
            />
          </label>
        ) : null}

        {schedule.kind === "custom" ? (
          <input
            value={schedule.cron}
            onChange={(e) => update({ kind: "custom", cron: e.target.value })}
            placeholder="30 8 * * MON,THU"
            aria-label="Cron expression"
            className={`${inputClass} w-52 font-mono`}
          />
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-muted">{hint(schedule)}</p>
    </div>
  );
}

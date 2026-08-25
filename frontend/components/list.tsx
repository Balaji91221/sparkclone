"use client";

// Shared list grammar used by every data page: a status tile, day-group
// headers, a filter-chip row, and a KPI strip. Keeping these in one place is
// what makes Runs / Schedules / Approvals read as one product.

import type { ReactNode } from "react";
import type { RunStatus } from "@/lib/types";
import { Icon } from "./icons";

type TileLook = { icon: string; className: string; spin?: boolean };

const STATUS_TILE: Record<RunStatus, TileLook> = {
  succeeded: { icon: "check", className: "bg-ok-soft text-ok" },
  failed: { icon: "x", className: "bg-danger-soft text-danger" },
  running: { icon: "play", className: "bg-accent-soft text-accent", spin: true },
  queued: { icon: "clock", className: "bg-info-soft text-info" },
  waiting_approval: { icon: "shield", className: "bg-warn-soft text-warn" },
  cancelled: { icon: "x", className: "bg-surface-2 text-muted" },
};

export function StatusTile({ status }: { status: RunStatus }) {
  const look = STATUS_TILE[status];
  return (
    <span
      aria-hidden
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${look.className}
        ${look.spin ? "pulse-soft" : ""}`}
    >
      <Icon name={look.icon} className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}

export function DayHeader({ label }: { label: string }) {
  return (
    <p className="bg-background/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em]
      text-muted backdrop-blur">
      {label}
    </p>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted/70" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

type Chip<T extends string> = { value: T; label: string; count?: number };

type FilterChipsProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  chips: Array<Chip<T>>;
  label: string;
};

export function FilterChips<T extends string>({ value, onChange, chips, label }: FilterChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]
              font-medium transition duration-150 ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-line bg-surface text-muted hover:border-foreground/30 hover:text-foreground"
              }`}
          >
            {c.label}
            {c.count !== undefined ? (
              <span className={`tabular-nums ${active ? "text-background/70" : "text-muted/70"}`}>
                {c.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:w-64">
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-line bg-surface py-1.5 pl-9 pr-3 text-[13px]
          outline-none transition placeholder:text-muted focus:border-accent
          focus:ring-2 focus:ring-accent-soft"
      />
    </label>
  );
}

type KpiProps = { label: string; value: ReactNode; hint?: string; tone?: "ok" | "warn" | "danger" };

const KPI_TONE = { ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;

export function Kpi({ label, value, hint, tone }: KpiProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${tone ? KPI_TONE[tone] : ""}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

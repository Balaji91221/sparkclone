"use client";

// Small shared pieces of the activity timeline: the rail row, icons, and the
// monospace result block styling.

import type { ReactNode } from "react";

export const mono =
  "max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 " +
  "font-mono text-xs leading-relaxed text-muted";

export function Row({ icon, iconClass, state = "plain", children }: {
  icon: ReactNode;
  iconClass?: string;
  state?: "active" | "done" | "plain";
  children: ReactNode;
}) {
  return (
    <div className="anim-rise relative flex gap-3 pb-5 last:pb-0">
      <div
        className="rail-line absolute bottom-0 left-[13px] top-8 w-px bg-line"
      />
      <span
        className={`z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]
          transition-shadow duration-500 ${iconClass ?? "bg-surface-2"} ${
            state === "active"
              ? "pulse-soft ring-1 ring-accent/40"
              : state === "done"
                ? "ring-1 ring-ok/40"
                : ""
          }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </div>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

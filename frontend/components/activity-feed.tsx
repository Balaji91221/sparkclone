"use client";

// Gemini-style activity timeline: reasoning lines, narration, and tool steps
// with expandable details, rendered from a normalized Step list.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { toSteps, toolSummary } from "@/lib/transcript-steps";
import type { Step } from "@/lib/transcript-steps";

type ToolLook = { label: string; icon: string; className: string };

const TOOL_LOOKS: Record<string, ToolLook> = {
  read_gmail: { label: "Gmail", icon: "✉️", className: "bg-danger-soft" },
  send_gmail: { label: "Gmail · send", icon: "✉️", className: "bg-danger-soft" },
  read_inbox: { label: "Inbox (IMAP)", icon: "✉️", className: "bg-danger-soft" },
  send_email: { label: "Email · send", icon: "✉️", className: "bg-danger-soft" },
  notify: { label: "Notify", icon: "🔔", className: "bg-warn-soft" },
  web_fetch: { label: "Web", icon: "🌐", className: "bg-info-soft" },
  run_python: { label: "Python", icon: "🐍", className: "bg-accent-soft" },
  youtube_channel_feed: { label: "YouTube", icon: "▶️", className: "bg-danger-soft" },
  youtube_transcript: { label: "YouTube · transcript", icon: "▶️", className: "bg-danger-soft" },
  list_drive_files: { label: "Drive", icon: "📁", className: "bg-ok-soft" },
  read_drive_file: { label: "Drive · read", icon: "📁", className: "bg-ok-soft" },
};

const toolLook = (name: string): ToolLook =>
  TOOL_LOOKS[name] ?? { label: name, icon: "🛠️", className: "bg-surface-2" };

const pre =
  "mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 " +
  "font-mono text-xs leading-relaxed text-muted";

function Row({ icon, iconClass, children }: {
  icon: ReactNode;
  iconClass?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className="absolute bottom-0 left-[13px] top-8 w-px bg-line" />
      <span
        className={`z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]
          ${iconClass ?? "bg-surface-2"}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function StepView({ step, live }: { step: Step; live: boolean }) {
  switch (step.kind) {
    case "task":
      return (
        <Row icon="📋">
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Task instructions
              <span className="ml-2 text-xs font-normal text-muted">
                ({step.text.length.toLocaleString()} chars — click to expand)
              </span>
            </summary>
            <pre className={pre}>{step.text}</pre>
          </details>
        </Row>
      );
    case "reasoning":
      return (
        <Row icon={<ClockIcon />}>
          <details>
            <summary className="cursor-pointer text-sm leading-relaxed text-muted">
              {firstSentence(step.text)}
            </summary>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {step.text}
            </p>
          </details>
        </Row>
      );
    case "narration":
      return (
        <Row icon="✦" iconClass="bg-accent-soft text-accent">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{step.text}</p>
        </Row>
      );
    case "tool": {
      const look = toolLook(step.name);
      const summary = toolSummary(step.input);
      return (
        <Row icon={look.icon} iconClass={look.className}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{look.label}</span>
            <code className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
              {step.name}
            </code>
            {step.result === null ? (
              live ? (
                <span className="flex items-center gap-1.5 text-xs text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  running
                </span>
              ) : (
                <span className="text-xs text-muted">no result</span>
              )
            ) : null}
          </div>
          {summary ? <p className="mt-0.5 truncate text-[13px] text-muted">{summary}</p> : null}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-accent">Details</summary>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Input
            </p>
            <pre className={pre}>{JSON.stringify(step.input, null, 2)}</pre>
            {step.result !== null ? (
              <>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Result
                </p>
                <pre className={pre}>{step.result}</pre>
              </>
            ) : null}
          </details>
        </Row>
      );
    }
    case "raw":
      return (
        <Row icon="?">
          <pre className={pre}>{JSON.stringify(step.value, null, 2)}</pre>
        </Row>
      );
    default: {
      const _exhaustive: never = step;
      throw new Error(`unhandled step: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.search(/[.!?]\s/);
  const head = cut > 20 ? flat.slice(0, cut + 1) : flat;
  return head.length > 140 ? `${head.slice(0, 140)}…` : head;
}

export function ActivityFeed({ transcript, live }: { transcript: unknown; live: boolean }) {
  const steps = toSteps(transcript);
  const endRef = useRef<HTMLDivElement | null>(null);
  const count = steps.length;

  useEffect(() => {
    if (live && count > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count, live]);

  if (steps.length === 0 && !live) {
    return <p className="text-sm text-muted">No activity recorded.</p>;
  }

  return (
    <div>
      {steps.map((s, i) => (
        <StepView key={i} step={s} live={live} />
      ))}
      {live ? (
        <Row icon="✦" iconClass="bg-accent-soft text-accent">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-accent" />
            </span>
            Working on it…
          </p>
        </Row>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

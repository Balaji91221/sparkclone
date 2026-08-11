"use client";

// Gemini-style activity timeline: a collapsible pill header, grouped reasoning
// with "Show all", narration, and tool steps with polished input/result
// expanders — rendered from a normalized Step list.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { displayResult, toSteps, toolSummary } from "@/lib/transcript-steps";
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
  youtube_video_info: { label: "YouTube · info", icon: "▶️", className: "bg-danger-soft" },
  list_drive_files: { label: "Drive", icon: "📁", className: "bg-ok-soft" },
  read_drive_file: { label: "Drive · read", icon: "📁", className: "bg-ok-soft" },
};

const toolLook = (name: string): ToolLook => {
  const known = TOOL_LOOKS[name];
  if (known) return known;
  if (name.startsWith("mcp_")) {
    return { label: name.split("_")[1] ?? "MCP", icon: "🔌", className: "bg-accent-soft" };
  }
  return { label: name, icon: "🛠️", className: "bg-surface-2" };
};

const mono =
  "max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 " +
  "font-mono text-xs leading-relaxed text-muted";

// Steps with consecutive reasoning collapsed into one group.
type FeedItem = Step | { kind: "reasoning-group"; texts: string[] };

function groupSteps(steps: Step[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const s of steps) {
    const last = items[items.length - 1];
    if (s.kind === "reasoning") {
      if (last && last.kind === "reasoning-group") last.texts.push(s.text);
      else items.push({ kind: "reasoning-group", texts: [s.text] });
    } else {
      items.push(s);
    }
  }
  return items;
}

function Row({ icon, iconClass, state = "plain", children }: {
  icon: ReactNode;
  iconClass?: string;
  state?: "active" | "done" | "plain";
  children: ReactNode;
}) {
  return (
    <div className="anim-rise relative flex gap-3 pb-5 last:pb-0">
      <div
        className="rail-line absolute bottom-0 left-[13px] top-8 w-px
          bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_45%,var(--line))] to-line"
      />
      <span
        className={`z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]
          transition-shadow duration-500 ${iconClass ?? "bg-surface-2"} ${
            state === "active"
              ? "spark-pulse ring-2 ring-accent/50"
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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ReasoningGroup({ texts }: { texts: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? texts : texts.slice(0, 2);
  const overflow = texts.length > 2;
  return (
    <Row icon={<ClockIcon />}>
      <div className="space-y-2">
        {visible.map((t, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap text-sm italic leading-relaxed text-muted ${
              !expanded && overflow && i === 1 ? "opacity-45" : ""
            }`}
          >
            {t}
          </p>
        ))}
        {overflow ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium
              text-accent transition hover:bg-accent-soft"
          >
            {expanded ? "Show less" : `Show all (${texts.length})`}
          </button>
        ) : null}
      </div>
    </Row>
  );
}

function ToolStep({ step, live }: { step: Extract<Step, { kind: "tool" }>; live: boolean }) {
  const [open, setOpen] = useState(false);
  const look = toolLook(step.name);
  const summary = toolSummary(step.input);
  const rowState = step.result === null ? (live ? "active" : "plain") : "done";
  const result = step.result === null ? null : displayResult(step.result);

  return (
    <Row icon={look.icon} iconClass={look.className} state={rowState}>
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

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 flex items-center gap-1.5 rounded-full border border-line px-3
          py-1 text-xs font-medium text-muted transition hover:border-accent/50
          hover:text-accent"
      >
        <Chevron open={open} />
        Input &amp; result
      </button>

      {open ? (
        <div className="anim-fade mt-2 space-y-2.5 rounded-xl border border-line bg-surface p-3">
          <div>
            <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Input
            </p>
            <pre className={mono}>{JSON.stringify(step.input, null, 2)}</pre>
          </div>
          {result ? (
            <div>
              <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Result
                {result.external ? (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-warn">
                    external content — treated as data
                  </span>
                ) : null}
                <span className="font-normal normal-case tracking-normal">
                  {result.text.length.toLocaleString()} chars
                </span>
              </p>
              <pre className={mono}>{result.text}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </Row>
  );
}

function StepView({ item, live }: { item: FeedItem; live: boolean }) {
  switch (item.kind) {
    case "task":
      return (
        <Row icon="📋">
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Task instructions
              <span className="ml-2 text-xs font-normal text-muted">
                ({item.text.length.toLocaleString()} chars — click to expand)
              </span>
            </summary>
            <pre className={`${mono} mt-2`}>{item.text}</pre>
          </details>
        </Row>
      );
    case "reasoning-group":
      return <ReasoningGroup texts={item.texts} />;
    case "reasoning":
      return <ReasoningGroup texts={[item.text]} />;
    case "narration":
      return (
        <Row icon="✦" iconClass="bg-accent-soft text-accent">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p>
        </Row>
      );
    case "tool":
      return <ToolStep step={item} live={live} />;
    case "raw":
      return (
        <Row icon="?">
          <pre className={mono}>{JSON.stringify(item.value, null, 2)}</pre>
        </Row>
      );
    default: {
      const _exhaustive: never = item;
      throw new Error(`unhandled step: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

type ActivityFeedProps = { transcript: unknown; live: boolean; finishedOk: boolean };

export function ActivityFeed({ transcript, live, finishedOk }: ActivityFeedProps) {
  const steps = toSteps(transcript);
  const items = groupSteps(steps);
  // Collapsed by default only for finished, successful runs (Gemini-style):
  // the summary is the star; the trace is a click away.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (live || !finishedOk);
  const endRef = useRef<HTMLDivElement | null>(null);
  const count = steps.length;

  useEffect(() => {
    if (live && count > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count, live]);

  if (steps.length === 0 && !live) {
    return <p className="text-sm text-muted">No activity recorded.</p>;
  }

  const toolCount = steps.filter((s) => s.kind === "tool").length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-line
          bg-surface px-4 py-1.5 text-sm font-medium shadow-sm transition
          hover:border-accent/50 hover:text-accent"
      >
        {live ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-accent" />
          </span>
        ) : (
          <span aria-hidden>✦</span>
        )}
        {live ? "Working through the task" : `Worked through ${toolCount} tool ${toolCount === 1 ? "step" : "steps"}`}
        <Chevron open={expanded} />
      </button>

      {expanded ? (
        <div>
          {items.map((item, i) => (
            <StepView key={i} item={item} live={live} />
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
      ) : null}
    </div>
  );
}

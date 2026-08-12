"use client";

// Gemini-style activity timeline: a collapsible pill header, grouped reasoning
// with "Show all", narration, and tool steps with polished input/result
// expanders — rendered from a normalized Step list.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { displayResult, toSteps, toolSummary } from "@/lib/transcript-steps";
import type { Step } from "@/lib/transcript-steps";
import { Icon } from "./icons";
import { Markdown } from "./markdown";

type ToolLook = { label: string; icon: string; className: string };

const TOOL_LOOKS: Record<string, ToolLook> = {
  read_gmail: { label: "Gmail", icon: "mail", className: "bg-surface-2 text-muted" },
  send_gmail: { label: "Gmail · send", icon: "mail", className: "bg-surface-2 text-muted" },
  read_inbox: { label: "Inbox (IMAP)", icon: "mail", className: "bg-surface-2 text-muted" },
  send_email: { label: "Email · send", icon: "mail", className: "bg-surface-2 text-muted" },
  notify: { label: "Notify", icon: "bell", className: "bg-surface-2 text-muted" },
  web_fetch: { label: "Web", icon: "globe", className: "bg-surface-2 text-muted" },
  run_python: { label: "Python", icon: "code", className: "bg-surface-2 text-muted" },
  youtube_channel_feed: { label: "YouTube", icon: "play", className: "bg-surface-2 text-muted" },
  youtube_transcript: {
    label: "YouTube · transcript", icon: "play", className: "bg-surface-2 text-muted" },
  youtube_video_info: {
    label: "YouTube · info", icon: "play", className: "bg-surface-2 text-muted" },
  list_drive_files: { label: "Drive", icon: "folder", className: "bg-surface-2 text-muted" },
  read_drive_file: { label: "Drive · read", icon: "folder", className: "bg-surface-2 text-muted" },
  create_task: { label: "Create task", icon: "calendar", className: "bg-accent-soft text-accent" },
  update_task: { label: "Update task", icon: "calendar", className: "bg-accent-soft text-accent" },
  list_tasks: { label: "List tasks", icon: "calendar", className: "bg-surface-2 text-muted" },
  delete_task: { label: "Delete task", icon: "trash", className: "bg-danger-soft text-danger" },
  run_task_now: { label: "Run task", icon: "play", className: "bg-accent-soft text-accent" },
  list_recent_runs: { label: "Recent runs", icon: "clock", className: "bg-surface-2 text-muted" },
  create_skill: { label: "Create skill", icon: "book", className: "bg-accent-soft text-accent" },
  list_skills: { label: "List skills", icon: "book", className: "bg-surface-2 text-muted" },
};

const toolLook = (name: string): ToolLook => {
  const known = TOOL_LOOKS[name];
  if (known) return known;
  if (name.startsWith("mcp_")) {
    return {
      label: name.split("_")[1] ?? "MCP", icon: "plug",
      className: "bg-surface-2 text-muted" };
  }
  return { label: name, icon: "wrench", className: "bg-surface-2 text-muted" };
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

const REASONING_CLAMP = 420;

function ReasoningBody({ texts, small }: { texts: string[]; small?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const total = texts.reduce((n, t) => n + t.length, 0);
  const overflow = texts.length > 2 || total > REASONING_CLAMP;
  let visible = texts;
  if (!expanded && overflow) {
    // Show roughly the first CLAMP characters across items, fade the tail.
    visible = [];
    let used = 0;
    for (const t of texts) {
      if (used >= REASONING_CLAMP) break;
      const room = REASONING_CLAMP - used;
      visible.push(t.length > room ? `${t.slice(0, room)}…` : t);
      used += t.length;
    }
  }
  return (
    <div className="space-y-2">
      {visible.map((t, i) => (
        <p
          key={i}
          className={`whitespace-pre-wrap italic leading-relaxed text-muted ${
            small ? "text-[13px]" : "text-sm"
          } ${!expanded && overflow && i === visible.length - 1 ? "opacity-45" : ""}`}
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
          {expanded ? "Show less" : "Show all thinking"}
        </button>
      ) : null}
    </div>
  );
}

function ReasoningGroup({ texts }: { texts: string[] }) {
  return (
    <Row icon={<ClockIcon />}>
      <ReasoningBody texts={texts} />
    </Row>
  );
}

function ToolDetails({ input, result }: {
  input: unknown;
  result: { text: string; external: boolean } | null;
}) {
  return (
    <div className="anim-fade mt-2 space-y-2.5 rounded-xl border border-line bg-surface p-3">
      <div>
        <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Input
        </p>
        <pre className={mono}>{JSON.stringify(input, null, 2)}</pre>
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
        {look.label !== step.name ? (
          <code className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
            {step.name}
          </code>
        ) : null}
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
      {open ? <ToolDetails input={step.input} result={result} /> : null}
    </Row>
  );
}

// ---------------------------------------------------------------- chat view

function ChatToolStep({ step, live }: { step: Extract<Step, { kind: "tool" }>; live: boolean }) {
  const [open, setOpen] = useState(false);
  const look = toolLook(step.name);
  const running = step.result === null && live;
  const result = step.result === null ? null : displayResult(step.result);

  return (
    <div className="anim-rise mb-3 border-l-2 border-line pl-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-2 rounded-full border
          border-line bg-surface py-1 pl-1.5 pr-3 text-[13px] transition duration-150
          hover:bg-surface-2"
      >
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]
            ${look.className} ${running ? "pulse-soft ring-1 ring-accent/40" : ""}`}
        >
          <Icon name={look.icon} className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium">{look.label}</span>
        {toolSummary(step.input) ? (
          <span className="max-w-56 truncate text-muted">{toolSummary(step.input)}</span>
        ) : null}
        {running ? <span className="text-xs text-accent">running…</span> : null}
        <Chevron open={open} />
      </button>
      {open ? <ToolDetails input={step.input} result={result} /> : null}
    </div>
  );
}

function ChatItem({ item, live }: { item: FeedItem; live: boolean }) {
  switch (item.kind) {
    case "task":
      return (
        <div className="anim-rise mb-6 flex justify-end">
          <div
            className="max-w-[75%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5
              text-sm leading-relaxed text-accent-fg shadow-sm"
          >
            <p className="whitespace-pre-wrap">{item.text}</p>
          </div>
        </div>
      );
    case "reasoning-group":
      return (
        <div className="anim-rise mb-3 border-l-2 border-line pl-4">
          <ReasoningBody texts={item.texts} small />
        </div>
      );
    case "reasoning":
      return (
        <div className="anim-rise mb-3 border-l-2 border-line pl-4">
          <ReasoningBody texts={[item.text]} small />
        </div>
      );
    case "narration":
      return (
        <div className="anim-rise mb-6 flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full
              bg-accent-soft text-[13px] text-accent"
          >
            <Icon name="sparkle" className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <Markdown>{item.text}</Markdown>
          </div>
        </div>
      );
    case "tool":
      return <ChatToolStep step={item} live={live} />;
    case "raw":
      return (
        <div className="anim-rise mb-3 border-l-2 border-line pl-4">
          <pre className={mono}>{JSON.stringify(item.value, null, 2)}</pre>
        </div>
      );
    default: {
      const _exhaustive: never = item;
      throw new Error(`unhandled chat item: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function StepView({ item, live }: { item: FeedItem; live: boolean }) {
  switch (item.kind) {
    case "task":
      return (
        <Row icon={<Icon name="book" className="h-3.5 w-3.5 text-muted" />}>
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
        <Row icon={<Icon name="sparkle" className="h-3.5 w-3.5" />} iconClass="bg-accent-soft text-accent">
          <Markdown>{item.text}</Markdown>
        </Row>
      );
    case "tool":
      return <ToolStep step={item} live={live} />;
    case "raw":
      return (
        <Row icon={<Icon name="wrench" className="h-3.5 w-3.5 text-muted" />}>
          <pre className={mono}>{JSON.stringify(item.value, null, 2)}</pre>
        </Row>
      );
    default: {
      const _exhaustive: never = item;
      throw new Error(`unhandled step: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// Nudge prompts the runtime injects mid-conversation; hidden from display.
const NUDGE_PREFIXES = [
  "If the task is fully complete, reply with the final summary",
  "If you have finished, reply to the user now.",
];

const isNudge = (s: Step) =>
  s.kind === "task" && NUDGE_PREFIXES.some((p) => s.text.startsWith(p));

type ActivityFeedProps = {
  transcript: unknown;
  live: boolean;
  finishedOk: boolean;
  variant?: "run" | "chat";
};

export function ActivityFeed({ transcript, live, finishedOk, variant = "run" }: ActivityFeedProps) {
  const steps = toSteps(transcript).filter((s) => !isNudge(s));
  const items = groupSteps(steps);
  // Collapsed by default only for finished, successful runs (Gemini-style):
  // the summary is the star; the trace is a click away.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (live || !finishedOk);
  const endRef = useRef<HTMLDivElement | null>(null);
  const count = steps.length;

  useEffect(() => {
    // Runs scroll only while live; chat follows every new message.
    if ((live || variant === "chat") && count > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [count, live, variant]);

  if (steps.length === 0 && !live) {
    return <p className="text-sm text-muted">No activity recorded.</p>;
  }

  const toolCount = steps.filter((s) => s.kind === "tool").length;

  if (variant === "chat") {
    return (
      <div>
        {items.map((item, i) => (
          <ChatItem key={i} item={item} live={live} />
        ))}
        {live ? (
          <div className="mb-4 flex items-center gap-3">
            <span
              className="pulse-soft grid h-7 w-7 place-items-center rounded-full
                bg-accent-soft text-[13px] text-accent"
            >
              <Icon name="sparkle" className="h-3.5 w-3.5" />
            </span>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-accent" />
              </span>
              Thinking…
            </p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-line
          bg-surface px-4 py-1.5 text-sm font-medium shadow-[var(--shadow-card)]
          transition duration-150 hover:bg-surface-2"
      >
        {live ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-accent" />
          </span>
        ) : (
          <span aria-hidden><Icon name="sparkle" className="h-3.5 w-3.5" /></span>
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
            <Row icon={<Icon name="sparkle" className="h-3.5 w-3.5" />} iconClass="bg-accent-soft text-accent">
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

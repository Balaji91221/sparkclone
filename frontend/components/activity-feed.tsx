"use client";

// Gemini-style activity timeline: a collapsible pill header, grouped reasoning
// with "Show all", narration, and tool steps with polished input/result
// expanders — rendered from a normalized Step list. The per-item renderers and
// primitives live in ./activity/*.

import { useState } from "react";
import { toSteps } from "@/lib/transcript-steps";
import { Icon } from "./icons";
import { ChatItem, groupSteps, isNudge, StepView } from "./activity/items";
import type { FeedItem } from "./activity/items";
import { WorkBlock } from "./activity/work-block";
import { Chevron, Row } from "./activity/primitives";
import { useAutoscroll } from "./activity/use-autoscroll";

type ActivityFeedProps = {
  transcript: unknown;
  live: boolean;
  finishedOk: boolean;
  variant?: "run" | "chat";
};

function PulseDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-accent" />
    </span>
  );
}

export function ActivityFeed({ transcript, live, finishedOk, variant = "run" }: ActivityFeedProps) {
  const steps = toSteps(transcript).filter((s) => !isNudge(s));
  const items = groupSteps(steps);
  // Collapsed by default only for finished, successful runs (Gemini-style):
  // the summary is the star; the trace is a click away.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (live || !finishedOk);
  const endRef = useAutoscroll(steps.length, live || variant === "chat");

  if (steps.length === 0 && !live) {
    return <p className="text-sm text-muted">No activity recorded.</p>;
  }

  const toolCount = steps.filter((s) => s.kind === "tool").length;

  if (variant === "chat") {
    // Fold each run of reasoning/tool steps into one collapsible "work" row so
    // the reply, not the trace, is what the eye lands on.
    const blocks: Array<{ kind: "work"; items: FeedItem[] } | { kind: "item"; item: FeedItem }> = [];
    for (const item of items) {
      const isWork = item.kind === "reasoning" || item.kind === "reasoning-group" || item.kind === "tool";
      const last = blocks[blocks.length - 1];
      if (isWork && last && last.kind === "work") last.items.push(item);
      else if (isWork) blocks.push({ kind: "work", items: [item] });
      else blocks.push({ kind: "item", item });
    }
    return (
      <div>
        {blocks.map((b, i) => {
          const isLast = i === blocks.length - 1;
          return b.kind === "work" ? (
            <WorkBlock key={i} items={b.items} live={live && isLast} />
          ) : (
            <ChatItem key={i} item={b.item} live={live && isLast} />
          );
        })}
        {live ? (
          <div className="mb-4 flex items-center gap-3">
            <span
              className="pulse-soft grid h-7 w-7 place-items-center rounded-full
                bg-accent-soft text-[13px] text-accent"
            >
              <Icon name="sparkle" className="h-3.5 w-3.5" />
            </span>
            <p className="flex items-center gap-2 text-sm text-muted">
              <PulseDot />
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
          <PulseDot />
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
                <PulseDot />
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

"use client";

// Reasoning display: clamped inline body (runs) and a tucked-away disclosure
// (chat), where the reply is the star and the thinking is a click away.

import { useState } from "react";
import { Icon } from "../icons";
import { Chevron, ClockIcon, Row } from "./primitives";

const REASONING_CLAMP = 420;

export function ReasoningBody({ texts, small }: { texts: string[]; small?: boolean }) {
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

export function ReasoningGroup({ texts }: { texts: string[] }) {
  return (
    <Row icon={<ClockIcon />}>
      <ReasoningBody texts={texts} />
    </Row>
  );
}

export function ChatReasoning({ texts, live }: { texts: string[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="anim-rise mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line
          bg-surface px-3 py-1 text-xs font-medium text-muted transition duration-150
          hover:bg-surface-2 hover:text-foreground"
      >
        <Icon name="sparkle" className={`h-3 w-3 ${live ? "pulse-soft" : ""}`} />
        {live ? "Thinking…" : "Thought process"}
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="mt-2 border-l-2 border-line pl-4">
          <ReasoningBody texts={texts} small />
        </div>
      ) : null}
    </div>
  );
}

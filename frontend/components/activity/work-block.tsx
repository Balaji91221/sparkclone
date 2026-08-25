"use client";

// One collapsible row summarising a run of thinking + tool steps in chat:
// "Worked through 3 steps · Gmail, Web". Expands to the individual items.

import { useState } from "react";
import { Icon } from "../icons";
import type { FeedItem } from "./items";
import { ChatItem } from "./items";
import { Chevron } from "./primitives";
import { toolLook } from "./tool-looks";

export function WorkBlock({ items, live }: { items: FeedItem[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const tools = items.filter((i) => i.kind === "tool");
  const labels = [...new Set(tools.map((t) => (t.kind === "tool" ? toolLook(t.name).label : "")))]
    .filter(Boolean);
  const running = live && tools.some((t) => t.kind === "tool" && t.result === null);

  // A lone reasoning item keeps the lighter "Show thinking" treatment.
  if (tools.length === 0 && items.length === 1) {
    return <ChatItem item={items[0]} live={live} />;
  }

  const summary = live
    ? "Working…"
    : `Worked through ${items.length} ${items.length === 1 ? "step" : "steps"}`;

  return (
    <div className="anim-rise mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-line
          bg-surface py-1 pl-1.5 pr-3 text-[13px] text-muted transition duration-150
          hover:bg-surface-2 hover:text-foreground"
      >
        <span className="flex -space-x-1.5">
          {tools.slice(0, 3).map((t) => {
            if (t.kind !== "tool") return null;
            const look = toolLook(t.name);
            return (
              <span
                key={t.id}
                className={`grid h-5 w-5 place-items-center rounded-full ring-2 ring-surface
                  ${look.className}`}
              >
                <Icon name={look.icon} className="h-3 w-3" />
              </span>
            );
          })}
          {tools.length === 0 ? (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-accent">
              <Icon name="sparkle" className={`h-3 w-3 ${running ? "pulse-soft" : ""}`} />
            </span>
          ) : null}
        </span>
        <span className={`font-medium ${running ? "pulse-soft" : ""}`}>{summary}</span>
        {labels.length ? (
          <span className="truncate text-muted/80">· {labels.slice(0, 3).join(", ")}</span>
        ) : null}
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="mt-3 border-l-2 border-line pl-4">
          {items.map((item, i) => (
            <ChatItem key={i} item={item} live={live && i === items.length - 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

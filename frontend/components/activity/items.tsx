"use client";

// Feed item model + the per-item renderers for both variants: the run
// timeline (StepView) and the chat conversation (ChatItem).

import { Icon } from "../icons";
import { Markdown } from "../markdown";
import type { Step } from "@/lib/transcript-steps";
import { mono, Row } from "./primitives";
import { ChatReasoning, ReasoningGroup } from "./reasoning";
import { ChatToolStep, ToolStep } from "./tool-step";

// Steps with consecutive reasoning collapsed into one group.
export type FeedItem = Step | { kind: "reasoning-group"; texts: string[] };

export function groupSteps(steps: Step[]): FeedItem[] {
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

// Nudge prompts the runtime injects mid-conversation; hidden from display.
const NUDGE_PREFIXES = [
  "If the task is fully complete, reply with the final summary",
  "If you have finished, reply to the user now.",
];

export const isNudge = (s: Step) =>
  s.kind === "task" && NUDGE_PREFIXES.some((p) => s.text.startsWith(p));

export function ChatItem({ item, live }: { item: FeedItem; live: boolean }) {
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
      return <ChatReasoning texts={item.texts} live={live} />;
    case "reasoning":
      return <ChatReasoning texts={[item.text]} live={live} />;
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

export function StepView({ item, live }: { item: FeedItem; live: boolean }) {
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

"use client";

// Tool call rendering: the timeline row (runs), the compact pill (chat), and
// the shared input/result expander.

import { useState } from "react";
import { displayResult, toolSummary } from "@/lib/transcript-steps";
import type { Step } from "@/lib/transcript-steps";
import { Icon } from "../icons";
import { Chevron, mono, Row } from "./primitives";
import { toolLook } from "./tool-looks";

type ToolCallStep = Extract<Step, { kind: "tool" }>;

export function ToolDetails({ input, result }: {
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

export function ToolStep({ step, live }: { step: ToolCallStep; live: boolean }) {
  const [open, setOpen] = useState(false);
  const look = toolLook(step.name);
  const summary = toolSummary(step.input);
  const rowState = step.result === null ? (live ? "active" : "plain") : "done";
  const result = step.result === null ? null : displayResult(step.result);

  return (
    <Row
      icon={<Icon name={look.icon} className="h-3.5 w-3.5" />}
      iconClass={look.className}
      state={rowState}
    >
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

export function ChatToolStep({ step, live }: { step: ToolCallStep; live: boolean }) {
  const [open, setOpen] = useState(false);
  const look = toolLook(step.name);
  const running = step.result === null && live;
  const result = step.result === null ? null : displayResult(step.result);

  return (
    <div className="anim-rise mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3
          text-[13px] text-muted transition duration-150 hover:bg-surface-2
          hover:text-foreground"
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

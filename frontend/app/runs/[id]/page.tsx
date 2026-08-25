"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { Markdown } from "@/components/markdown";
import { Button, ErrorBanner, Skeleton, StatusChip } from "@/components/ui";
import { getRun } from "@/lib/api";
import { ago } from "@/lib/format";
import type { RunDetail } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

const isLive = (s: RunDetail["status"]) =>
  s === "running" || s === "queued" || s === "waiting_approval";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;

  // Poll fast while the run is live; stop entirely once it reaches a
  // terminal state (a finished transcript never changes).
  const [live, setLive] = useState(true);
  const fetchRun = useCallback(
    async (signal: AbortSignal): Promise<RunDetail | null> => {
      const run = await getRun(runId, signal);
      if (run) setLive(isLive(run.status));
      return run;
    },
    [runId],
  );
  const { state } = usePoll(fetchRun, live ? 2000 : null);

  return (
    <div>
      <Link href="/runs" className="text-sm text-accent hover:underline">
        ← All runs
      </Link>

      {state.kind === "error" ? (
        <div className="mt-4">
          <ErrorBanner message={state.message} />
        </div>
      ) : null}
      {state.kind === "loading" ? (
        <div className="mt-4">
          <Skeleton rows={4} />
        </div>
      ) : null}

      {state.kind === "ready" && state.data ? <RunView run={state.data} /> : null}
      {state.kind === "ready" && !state.data ? (
        <p className="mt-4 text-sm text-muted">Run not found.</p>
      ) : null}
    </div>
  );
}

const parseTs = (t: string) => new Date(`${t.replace(" ", "T")}Z`).getTime();

function formatSeconds(s: number): string {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function duration(run: RunDetail): string {
  if (!run.finished_at || !run.created_at) return "";
  const ms = parseTs(run.finished_at) - parseTs(run.created_at);
  if (Number.isNaN(ms) || ms < 0) return "";
  return formatSeconds(Math.round(ms / 1000));
}

// Ticking elapsed time for a run that is still going.
function LiveDuration({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const start = parseTs(since);
  if (Number.isNaN(start)) return null;
  return <span>Running for {formatSeconds(Math.max(0, Math.round((now - start) / 1000)))}</span>;
}

function AttemptBadge({ attempt }: { attempt: number }) {
  if (attempt <= 0) return null;
  return (
    <span
      className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-[11px]
        font-medium text-warn"
    >
      retry {attempt}
    </span>
  );
}

function PreviousAttempts({ run }: { run: RunDetail }) {
  if (run.related.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span className="text-xs text-muted">Other runs of this task:</span>
      {run.related.map((r) => (
        <Link
          key={r.id}
          href={`/runs/${r.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1
            text-xs hover:border-accent"
        >
          <StatusChip status={r.status} />
          {r.attempt > 0 ? <span className="text-muted">retry {r.attempt}</span> : null}
          <span className="text-muted">{ago(r.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}

function CopyOutputButton({ output }: { output: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — quietly skip.
    }
  };
  return <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>;
}

function RunView({ run }: { run: RunDetail }) {
  const dur = duration(run);
  return (
    <div className="mt-4">
      <div
        className="glass sticky top-3 z-10 mb-6 rounded-xl border border-line px-5 py-4
          shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="truncate">{run.task_name || "Run detail"}</span>
            <AttemptBadge attempt={run.attempt} />
          </h1>
          <StatusChip status={run.status} />
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Trigger: {run.trigger || "manual"}</span>
          <span>Started {ago(run.created_at)}</span>
          {dur ? <span>Took {dur}</span> : null}
          {!dur && isLive(run.status) ? <LiveDuration since={run.created_at} /> : null}
          <span className="font-mono">{run.id.slice(0, 12)}…</span>
        </p>
        <PreviousAttempts run={run} />
      </div>

      {run.status === "waiting_approval" ? (
        <div
          className="mb-6 flex items-center justify-between rounded-xl border border-warn/40
            bg-warn-soft px-4 py-3 text-sm text-warn"
        >
          <span>The agent is paused, waiting for your decision on a sensitive action.</span>
          <Link href="/approvals" className="font-medium underline">
            Review approval
          </Link>
        </div>
      ) : null}

      {/* Gemini/Claude Code order: the agent's activity streams first, and the
          final response lands below it once the run completes. */}
      <section className="mb-6">
        <h2 className="mb-3 text-[15px] font-semibold">Activity</h2>
        <ActivityFeed
          transcript={run.transcript}
          live={isLive(run.status)}
          finishedOk={run.status === "succeeded"}
        />
      </section>

      {run.error ? (
        <section className="mb-6">
          <h2 className="mb-2 text-[15px] font-semibold text-danger">Error</h2>
          <pre
            className="overflow-auto whitespace-pre-wrap rounded-xl border border-danger/30
              bg-danger-soft p-4 font-mono text-xs text-danger"
          >
            {run.error}
          </pre>
        </section>
      ) : null}

      {run.output ? (
        <section className="anim-rise mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Response</h2>
            <CopyOutputButton output={run.output} />
          </div>
          <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-sm">
            <Markdown>{run.output}</Markdown>
          </div>
        </section>
      ) : null}
    </div>
  );
}

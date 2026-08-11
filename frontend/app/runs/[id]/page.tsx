"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { ErrorBanner, Skeleton, StatusChip } from "@/components/ui";
import { getRun } from "@/lib/api";
import { ago } from "@/lib/format";
import type { RunDetail } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;

  const fetchRun = useCallback(
    (signal: AbortSignal): Promise<RunDetail | null> => getRun(runId, signal),
    [runId],
  );
  const { state } = usePoll(fetchRun, 3000);

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

const isLive = (s: RunDetail["status"]) =>
  s === "running" || s === "queued" || s === "waiting_approval";

function duration(run: RunDetail): string {
  if (!run.finished_at || !run.created_at) return "";
  const parse = (t: string) => new Date(`${t.replace(" ", "T")}Z`).getTime();
  const ms = parse(run.finished_at) - parse(run.created_at);
  if (Number.isNaN(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
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
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {run.task_name || "Run detail"}
          </h1>
          <StatusChip status={run.status} />
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Trigger: {run.trigger || "manual"}</span>
          <span>Started {ago(run.created_at)}</span>
          {dur ? <span>Took {dur}</span> : null}
          <span className="font-mono">{run.id.slice(0, 12)}…</span>
        </p>
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

      {run.output ? (
        <section className="mb-6">
          <h2 className="mb-2 text-[15px] font-semibold">Result</h2>
          <div
            className="whitespace-pre-wrap rounded-xl border border-line bg-surface p-4
              text-sm leading-relaxed"
          >
            {run.output}
          </div>
        </section>
      ) : null}

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

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Activity</h2>
        <ActivityFeed transcript={run.transcript} live={isLive(run.status)} />
      </section>
    </div>
  );
}

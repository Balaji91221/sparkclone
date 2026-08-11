"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { ErrorBanner, StatusChip } from "@/components/ui";
import { getRun } from "@/lib/api";
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
      {state.kind === "loading" ? <p className="mt-4 text-sm text-muted">Loading…</p> : null}

      {state.kind === "ready" && state.data ? <RunView run={state.data} /> : null}
      {state.kind === "ready" && !state.data ? (
        <p className="mt-4 text-sm text-muted">Run not found.</p>
      ) : null}
    </div>
  );
}

const isLive = (s: RunDetail["status"]) =>
  s === "running" || s === "queued" || s === "waiting_approval";

function RunView({ run }: { run: RunDetail }) {
  return (
    <div className="mt-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Run detail</h1>
          <p className="mt-0.5 font-mono text-xs text-muted">{run.id}</p>
        </div>
        <StatusChip status={run.status} />
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

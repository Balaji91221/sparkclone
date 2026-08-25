"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton, StatusChip } from "@/components/ui";
import { listRuns } from "@/lib/api";
import { ago, formatTimestamp } from "@/lib/format";
import type { RunSummary } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

export default function RunsPage() {
  const fetchRuns = useCallback(
    (signal: AbortSignal): Promise<RunSummary[]> => listRuns(signal),
    [],
  );
  const { state } = usePoll(fetchRuns, 4000);

  const runs = state.kind === "ready" ? state.data : null;

  return (
    <div>
      <PageHeader
        title="Runs"
        lede="Every execution of every task, newest first. Open a run for its full transcript."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={5} /> : null}

      {runs && runs.length === 0 ? (
        <EmptyState title="No runs yet" hint="Run a task and its execution will appear here." />
      ) : null}

      {runs && runs.length > 0 ? (
        <Card>
          {runs.map((r, i) => (
            <Link
              key={r.id}
              href={`/runs/${r.id}`}
              className="anim-rise flex items-center justify-between gap-4 border-b
                border-line px-5 py-3.5 transition-colors last:border-0 hover:bg-surface-2"
              style={{ "--d": `${Math.min(i, 8) * 70}ms` } as React.CSSProperties}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{r.task_name || "(deleted task)"}</span>
                  {r.attempt > 0 ? (
                    <span
                      className="shrink-0 rounded-full border border-warn/40 bg-warn-soft
                        px-2 py-0.5 text-[11px] font-medium text-warn"
                    >
                      retry {r.attempt}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {formatTimestamp(r.created_at)} · {r.trigger} · {ago(r.created_at)}
                  {r.error ? ` · ${r.error.slice(0, 80)}` : ""}
                </p>
              </div>
              <StatusChip status={r.status} />
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

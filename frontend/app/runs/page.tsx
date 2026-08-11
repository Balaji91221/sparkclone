"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton, StatusChip } from "@/components/ui";
import { listRuns, listTasks } from "@/lib/api";
import { ago, formatTimestamp } from "@/lib/format";
import type { RunSummary, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

type RunsData = { runs: RunSummary[]; tasks: Task[] };

export default function RunsPage() {
  const fetchAll = useCallback(async (signal: AbortSignal): Promise<RunsData> => {
    const [runs, tasks] = await Promise.all([listRuns(signal), listTasks(signal)]);
    return { runs, tasks };
  }, []);
  const { state } = usePoll(fetchAll, 4000);

  const data = state.kind === "ready" ? state.data : null;
  const taskName = new Map(data?.tasks.map((t) => [t.id, t.name]) ?? []);

  return (
    <div>
      <PageHeader
        title="Runs"
        lede="Every execution of every task, newest first. Open a run for its full transcript."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={5} /> : null}

      {data && data.runs.length === 0 ? (
        <EmptyState title="No runs yet" hint="Run a task and its execution will appear here." />
      ) : null}

      {data && data.runs.length > 0 ? (
        <Card>
          {data.runs.map((r, i) => (
            <Link
              key={r.id}
              href={`/runs/${r.id}`}
              className="anim-rise flex items-center justify-between gap-4 border-b
                border-line px-5 py-3.5 transition-colors last:border-0 hover:bg-surface-2"
              style={{ "--d": `${Math.min(i, 8) * 55}ms` } as React.CSSProperties}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {taskName.get(r.task_id) ?? "(deleted task)"}
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

"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Chevron, DayHeader, FilterChips, Kpi, SearchField, StatusTile } from "@/components/list";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton, StatusChip } from "@/components/ui";
import { listRuns } from "@/lib/api";
import { ago, dayBucket } from "@/lib/format";
import type { RunStatus, RunSummary } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

const Filter = { All: "all", Active: "active", Succeeded: "succeeded", Failed: "failed" } as const;
type Filter = (typeof Filter)[keyof typeof Filter];

const ACTIVE: RunStatus[] = ["queued", "running", "waiting_approval"];

function matchesFilter(r: RunSummary, f: Filter): boolean {
  switch (f) {
    case Filter.All: return true;
    case Filter.Active: return ACTIVE.includes(r.status);
    case Filter.Succeeded: return r.status === "succeeded";
    case Filter.Failed: return r.status === "failed" || r.status === "cancelled";
    default: {
      const _exhaustive: never = f;
      throw new Error(`unhandled filter: ${String(_exhaustive)}`);
    }
  }
}

type RunsSnapshot = { runs: RunSummary[]; weekAgo: number };

const parseTs = (t: string) => new Date(`${t.replace(" ", "T")}Z`).getTime();

function took(r: RunSummary): string {
  if (!r.finished_at) return "";
  const s = Math.round((parseTs(r.finished_at) - parseTs(r.created_at)) / 1000);
  if (Number.isNaN(s) || s < 0) return "";
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function timeOf(ts: string): string {
  const d = new Date(`${ts.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function RunRow({ run, index }: { run: RunSummary; index: number }) {
  const dur = took(run);
  return (
    <Link
      href={`/runs/${run.id}`}
      className="anim-rise flex items-center gap-4 border-b border-line px-5 py-3.5
        transition-colors last:border-0 hover:bg-surface-2/60"
      style={{ "--d": `${Math.min(index, 8) * 40}ms` } as React.CSSProperties}
    >
      <StatusTile status={run.status} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{run.task_name || "(deleted task)"}</span>
          {run.attempt > 0 ? (
            <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px]
              font-medium text-warn">
              retry {run.attempt}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
          <span>{timeOf(run.created_at)}</span>
          <span aria-hidden>·</span>
          <span className="capitalize">{run.trigger || "manual"}</span>
          {dur ? (
            <>
              <span aria-hidden>·</span>
              <span>{dur}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{ago(run.created_at)}</span>
        </p>
        {run.error ? (
          <p className="mt-1 truncate text-[13px] text-danger/90">{run.error}</p>
        ) : null}
      </div>
      <StatusChip status={run.status} />
      <Chevron />
    </Link>
  );
}

export default function RunsPage() {
  // The "last 7 days" cut-off is stamped when data arrives, not during render
  // (the React compiler treats Date.now() in render as impure).
  const fetchRuns = useCallback(async (signal: AbortSignal): Promise<RunsSnapshot> => {
    const runs = await listRuns(signal);
    return { runs, weekAgo: Date.now() - 7 * 86_400_000 };
  }, []);
  const { state } = usePoll(fetchRuns, 4000);
  const [filter, setFilter] = useState<Filter>(Filter.All);
  const [query, setQuery] = useState("");

  const runs = useMemo(() => (state.kind === "ready" ? state.data.runs : []), [state]);
  const weekAgo = state.kind === "ready" ? state.data.weekAgo : 0;
  const counts = useMemo(() => ({
    all: runs.length,
    active: runs.filter((r) => matchesFilter(r, Filter.Active)).length,
    succeeded: runs.filter((r) => matchesFilter(r, Filter.Succeeded)).length,
    failed: runs.filter((r) => matchesFilter(r, Filter.Failed)).length,
  }), [runs]);
  const finished = counts.succeeded + counts.failed;
  const successRate = finished ? Math.round((counts.succeeded / finished) * 100) : null;
  const failedThisWeek = runs.filter(
    (r) => matchesFilter(r, Filter.Failed) && parseTs(r.created_at) > weekAgo,
  ).length;

  const q = query.trim().toLowerCase();
  const visible = runs.filter(
    (r) => matchesFilter(r, filter) && (!q || r.task_name.toLowerCase().includes(q)),
  );

  return (
    <div>
      <PageHeader
        title="Runs"
        lede="Every execution of every task, newest first. Open a run for its full transcript."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}

      {state.kind === "ready" ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total runs" value={counts.all} />
          <Kpi
            label="Success rate"
            value={successRate === null ? "—" : `${successRate}%`}
            hint={finished ? `of ${finished} finished` : "no finished runs"}
            tone={successRate !== null && successRate < 50 ? "warn" : "ok"}
          />
          <Kpi
            label="Failed · 7 days"
            value={failedThisWeek}
            tone={failedThisWeek ? "danger" : undefined}
          />
          <Kpi label="In progress" value={counts.active} hint="queued, running or paused" />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          label="Filter runs by status"
          value={filter}
          onChange={setFilter}
          chips={[
            { value: Filter.All, label: "All", count: counts.all },
            { value: Filter.Active, label: "In progress", count: counts.active },
            { value: Filter.Succeeded, label: "Succeeded", count: counts.succeeded },
            { value: Filter.Failed, label: "Failed", count: counts.failed },
          ]}
        />
        <SearchField value={query} onChange={setQuery} placeholder="Search by task" />
      </div>

      {state.kind === "loading" ? <Skeleton rows={5} /> : null}

      {state.kind === "ready" && runs.length === 0 ? (
        <EmptyState title="No runs yet" hint="Run a task and its execution will appear here." />
      ) : null}
      {state.kind === "ready" && runs.length > 0 && visible.length === 0 ? (
        <EmptyState title="Nothing matches" hint="Try another filter or clear the search." />
      ) : null}

      {visible.length > 0 ? (
        <Card>
          {visible.map((r, i) => {
            const bucket = dayBucket(r.created_at);
            const first = i === 0 || dayBucket(visible[i - 1].created_at) !== bucket;
            return (
              <div key={r.id}>
                {first ? <DayHeader label={bucket} /> : null}
                <RunRow run={r} index={i} />
              </div>
            );
          })}
        </Card>
      ) : null}
    </div>
  );
}

"use client";

// Gemini-style Schedules list: calm rows (name, human schedule, last run),
// grouped Ongoing / Paused, with actions tucked into a per-row menu.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui";
import { deleteTask, listRuns, listTasks, runTask, updateTask } from "@/lib/api";
import { ago, nextRunIn, scheduleHuman } from "@/lib/format";
import type { RunSummary, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

type TasksData = { tasks: Task[]; runs: RunSummary[] };

export default function TasksPage() {
  const router = useRouter();
  const [actionError, setActionError] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  const fetchAll = useCallback(async (signal: AbortSignal): Promise<TasksData> => {
    const [tasks, runs] = await Promise.all([listTasks(signal), listRuns(signal)]);
    return { tasks, runs };
  }, []);
  const { state, reload } = usePoll(fetchAll, 4000);

  const act = async (fn: () => Promise<void>) => {
    setActionError("");
    try {
      await fn();
      reload();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleEnabled = (t: Task) =>
    act(() =>
      // Full task body: omitting a field here would silently reset it.
      updateTask(t.id, {
        name: t.name,
        prompt: t.prompt,
        skill_ids: t.skill_ids,
        allowed_tools: t.allowed_tools,
        trigger_type: t.trigger_type,
        trigger_value: t.trigger_value,
        max_retries: t.max_retries,
        enabled: !t.enabled,
      }),
    );

  const data = state.kind === "ready" ? state.data : null;
  const lastRunByTask = new Map<string, RunSummary>();
  data?.runs.forEach((r) => {
    if (!lastRunByTask.has(r.task_id)) lastRunByTask.set(r.task_id, r);
  });

  const ongoing = data?.tasks.filter((t) => t.enabled) ?? [];
  const paused = data?.tasks.filter((t) => !t.enabled) ?? [];

  const row = (t: Task) => {
    const lr = lastRunByTask.get(t.id);
    const open = menuFor === t.id;
    return (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/tasks/${t.id}/edit`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/tasks/${t.id}/edit`);
        }}
        className="group relative flex cursor-pointer items-center gap-4 border-b
          border-line px-5 py-4 transition-colors duration-150 last:border-0
          hover:bg-surface-2/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{t.name}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {scheduleHuman(t)}
            {nextRunIn(t.next_run_at) ? (
              <span className="text-accent"> · {nextRunIn(t.next_run_at)}</span>
            ) : null}
          </p>
          {lr ? (
            <p className="mt-0.5 text-[13px] text-muted">
              Last run {ago(lr.created_at)}
              {lr.status === "failed" ? (
                <span className="text-danger"> · failed</span>
              ) : null}
              {lr.status === "running" ? (
                <span className="text-accent"> · running…</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-muted">Not run yet</p>
          )}
        </div>

        <button
          type="button"
          aria-label={`Actions for ${t.name}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(open ? null : t.id);
          }}
          className="rounded-full p-2 text-muted opacity-0 transition duration-150
            hover:bg-surface-2 hover:text-foreground focus:opacity-100
            group-hover:opacity-100 aria-expanded:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>

        {open ? (
          <div
            className="absolute right-4 top-12 z-10 w-44 overflow-hidden rounded-xl
              border border-line bg-surface py-1 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem icon="play" label="Run now"
              onClick={() => { setMenuFor(null); void act(() => runTask(t.id)); }} />
            <MenuItem icon="calendar" label="Edit"
              onClick={() => router.push(`/tasks/${t.id}/edit`)} />
            <MenuItem icon="clock" label={t.enabled ? "Pause" : "Resume"}
              onClick={() => { setMenuFor(null); void toggleEnabled(t); }} />
            <MenuItem icon="trash" label="Delete" danger
              onClick={() => {
                setMenuFor(null);
                if (window.confirm(`Delete schedule "${t.name}"?`)) {
                  void act(() => deleteTask(t.id));
                }
              }} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Schedules"
        lede="Get proactive help with tasks that run on repeat, respond to events, or
          monitor and react — Astra handles them in the background."
      />

      <div className="anim-rise mb-8 flex flex-wrap gap-3">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-5
            py-2.5 text-sm font-medium text-accent transition duration-150
            hover:brightness-95"
        >
          <Icon name="sparkle" className="h-4 w-4" />
          Create with Astra
        </Link>
        <Link
          href="/tasks/new"
          className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5
            py-2.5 text-sm font-medium text-foreground transition duration-150
            hover:bg-line"
        >
          <Icon name="calendar" className="h-4 w-4" />
          Create manually
        </Link>
      </div>

      {actionError ? <ErrorBanner message={actionError} /> : null}
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={3} /> : null}

      {data && data.tasks.length === 0 ? (
        <EmptyState
          title="No schedules yet"
          hint="Create one with Astra in chat, or set one up manually."
        />
      ) : null}

      {ongoing.length > 0 ? (
        <section className="anim-rise mb-8">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Ongoing</h2>
          <div className="overflow-visible rounded-2xl border border-line bg-surface
            shadow-[var(--shadow-card)]">
            {ongoing.map(row)}
          </div>
        </section>
      ) : null}

      {paused.length > 0 ? (
        <section className="anim-rise">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Paused</h2>
          <div className="overflow-visible rounded-2xl border border-line bg-surface
            shadow-[var(--shadow-card)] opacity-80">
            {paused.map(row)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type MenuItemProps = {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

function MenuItem({ icon, label, danger, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px]
        font-medium transition duration-150 hover:bg-surface-2 ${
          danger ? "text-danger" : "text-foreground"
        }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

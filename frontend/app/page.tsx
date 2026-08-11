"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { TaskDialog } from "@/components/task-dialog";
import type { TaskDialogRequest } from "@/components/task-dialog";
import { Card, Skeleton, StatCard, StatusChip } from "@/components/ui";
import { listApprovals, listRuns, listSkills, listTasks } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Approval, RunSummary, SkillDef, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

const SUGGESTIONS = [
  {
    title: "Declutter your inbox",
    desc: "Summarize or archive newsletters and unsubscribe from email lists",
    prompt:
      "Declutter my inbox: summarize or archive newsletters and unsubscribe from email lists",
  },
  {
    title: "Deep dive on topics",
    desc: "Pull research formatted to fit your goal, complete with cited sources",
    prompt:
      "Deep dive on a topic: pull research formatted to fit my goal, complete with cited sources",
  },
  {
    title: "Get a custom news digest",
    desc: "Go deep on the stories you care about and follow how they evolve",
    prompt:
      "Build me a custom news digest on the stories I care about and follow how they evolve",
  },
];

type HomeData = {
  tasks: Task[];
  runs: RunSummary[];
  skills: SkillDef[];
  approvals: Approval[];
};

export default function HomePage() {
  const [quick, setQuick] = useState("");
  const [dialog, setDialog] = useState<TaskDialogRequest>({ kind: "closed" });

  const fetchAll = useCallback(async (signal: AbortSignal): Promise<HomeData> => {
    const [tasks, runs, skills, approvals] = await Promise.all([
      listTasks(signal),
      listRuns(signal),
      listSkills(signal),
      listApprovals(signal),
    ]);
    return { tasks, runs, skills, approvals };
  }, []);
  const { state, reload } = usePoll(fetchAll, 4000);

  const openCreate = (prompt: string) => {
    setDialog({
      kind: "create",
      prefill: { name: prompt.split(":")[0].slice(0, 48), prompt },
    });
  };

  const data = state.kind === "ready" ? state.data : null;
  const taskName = new Map(data?.tasks.map((t) => [t.id, t.name]) ?? []);
  const finished = data?.runs.filter((r) => r.status === "succeeded" || r.status === "failed");
  const successRate =
    finished && finished.length > 0
      ? Math.round(
          (finished.filter((r) => r.status === "succeeded").length / finished.length) * 100,
        )
      : null;

  return (
    <div className="pt-6">
      <h1 className="mb-7 text-center text-3xl font-semibold tracking-tight">
        Put SparkClone to work for you
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          openCreate(quick.trim() || "Untitled task");
          setQuick("");
        }}
        className="mx-auto mb-8 flex max-w-2xl items-center gap-3 rounded-full border
          border-line bg-surface py-2 pl-6 pr-2 shadow-sm transition
          focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15"
      >
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Describe a task…"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg
            transition hover:opacity-90"
        >
          Create
        </button>
      </form>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Active tasks"
          value={data ? String(data.tasks.filter((t) => t.enabled).length) : "—"}
          hint={data ? `${data.tasks.length} total` : undefined}
        />
        <StatCard label="Runs recorded" value={data ? String(data.runs.length) : "—"} />
        <StatCard
          label="Success rate"
          value={successRate === null ? "—" : `${successRate}%`}
          tone={successRate !== null && successRate >= 80 ? "ok" : "default"}
          hint="of finished runs"
        />
        <StatCard
          label="Pending approvals"
          value={data ? String(data.approvals.length) : "—"}
          tone={data && data.approvals.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Recent activity</h2>
        <Link href="/runs" className="text-xs font-medium text-accent hover:underline">
          All runs →
        </Link>
      </div>
      {!data ? <Skeleton rows={3} /> : null}
      {data && data.runs.length > 0 ? (
        <Card>
          {data.runs.slice(0, 5).map((r) => (
            <Link
              key={r.id}
              href={`/runs/${r.id}`}
              className="flex items-center justify-between gap-4 border-b border-line px-5
                py-3.5 transition last:border-0 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {taskName.get(r.task_id) ?? "(deleted task)"}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {r.trigger} · {ago(r.created_at)}
                </p>
              </div>
              <StatusChip status={r.status} />
            </Link>
          ))}
        </Card>
      ) : null}
      {data && data.runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted">
          No runs yet — create a task above and press Run now.
        </p>
      ) : null}

      <h2 className="mb-3 mt-9 text-[15px] font-semibold">Suggested</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => openCreate(s.prompt)}
            className="rounded-xl border border-line bg-surface p-4 text-left transition
              hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium">{s.title}</p>
            <p className="mt-1 text-[13px] text-muted">{s.desc}</p>
          </button>
        ))}
      </div>

      <TaskDialog
        request={dialog}
        skills={data?.skills ?? []}
        onClose={() => setDialog({ kind: "closed" })}
        onSaved={reload}
      />
    </div>
  );
}

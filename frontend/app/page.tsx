"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { TaskDialog } from "@/components/task-dialog";
import type { TaskDialogRequest } from "@/components/task-dialog";
import { Card, StatusChip } from "@/components/ui";
import { listRuns, listSkills, listTasks } from "@/lib/api";
import { ago } from "@/lib/format";
import type { RunSummary, SkillDef, Task } from "@/lib/types";
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

type HomeData = { tasks: Task[]; runs: RunSummary[]; skills: SkillDef[] };

export default function HomePage() {
  const [quick, setQuick] = useState("");
  const [dialog, setDialog] = useState<TaskDialogRequest>({ kind: "closed" });

  const fetchAll = useCallback(async (signal: AbortSignal): Promise<HomeData> => {
    const [tasks, runs, skills] = await Promise.all([
      listTasks(signal),
      listRuns(signal),
      listSkills(signal),
    ]);
    return { tasks, runs, skills };
  }, []);
  const { state, reload } = usePoll(fetchAll, 4000);

  const openCreate = (prompt: string) => {
    setDialog({
      kind: "create",
      prefill: { name: prompt.split(":")[0].slice(0, 48), prompt },
    });
  };

  const data = state.kind === "ready" ? state.data : null;
  const lastRunByTask = new Map<string, RunSummary>();
  data?.runs.forEach((r) => {
    if (!lastRunByTask.has(r.task_id)) lastRunByTask.set(r.task_id, r);
  });

  return (
    <div className="pt-10">
      <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight">
        Put SparkClone to work for you
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          openCreate(quick.trim() || "Untitled task");
          setQuick("");
        }}
        className="mx-auto mb-10 flex max-w-2xl items-center gap-3 rounded-full border
          border-line bg-surface py-2 pl-6 pr-2 shadow-sm"
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

      <h2 className="mb-3 text-[15px] font-semibold">Recent tasks</h2>
      {data && data.tasks.length > 0 ? (
        <Card>
          {data.tasks.slice(0, 4).map((t) => {
            const lr = lastRunByTask.get(t.id);
            return (
              <Link
                key={t.id}
                href="/tasks"
                className="flex items-center justify-between gap-4 border-b border-line px-5
                  py-4 last:border-0 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{t.name}</p>
                  <p className="truncate text-sm text-muted">{t.prompt}</p>
                </div>
                {lr ? (
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {ago(lr.created_at)} <StatusChip status={lr.status} />
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted">never ran</span>
                )}
              </Link>
            );
          })}
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted">
          {state.kind === "error"
            ? `Could not load tasks: ${state.message}`
            : "No tasks yet — describe one above to get started."}
        </p>
      )}

      <h2 className="mb-3 mt-10 text-[15px] font-semibold">Suggested</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => openCreate(s.prompt)}
            className="rounded-xl border border-line bg-surface p-4 text-left transition
              hover:border-accent/50 hover:shadow-sm"
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

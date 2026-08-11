"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { TaskDialog } from "@/components/task-dialog";
import type { TaskDialogRequest } from "@/components/task-dialog";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  StatusChip,
} from "@/components/ui";
import { deleteTask, listRuns, listSkills, listTasks, runTask, updateTask } from "@/lib/api";
import { ago, cronHuman } from "@/lib/format";
import type { RunSummary, SkillDef, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

type TasksData = { tasks: Task[]; runs: RunSummary[]; skills: SkillDef[] };

export default function TasksPage() {
  const [dialog, setDialog] = useState<TaskDialogRequest>({ kind: "closed" });
  const [actionError, setActionError] = useState("");

  const fetchAll = useCallback(async (signal: AbortSignal): Promise<TasksData> => {
    const [tasks, runs, skills] = await Promise.all([
      listTasks(signal),
      listRuns(signal),
      listSkills(signal),
    ]);
    return { tasks, runs, skills };
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
      updateTask(t.id, {
        name: t.name,
        prompt: t.prompt,
        skill_ids: t.skill_ids,
        allowed_tools: t.allowed_tools,
        cron: t.cron,
        enabled: !t.enabled,
      }),
    );

  const data = state.kind === "ready" ? state.data : null;
  const lastRunByTask = new Map<string, RunSummary>();
  data?.runs.forEach((r) => {
    if (!lastRunByTask.has(r.task_id)) lastRunByTask.set(r.task_id, r);
  });
  const skillName = new Map(data?.skills.map((s) => [s.id, s.name]) ?? []);

  return (
    <div>
      <PageHeader
        title="Tasks"
        lede="Standing instructions for your agent — scheduled with cron or run on demand."
        action={
          <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
            New task
          </Button>
        }
      />
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={3} /> : null}

      {data && data.tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          hint="Create one and the agent will handle it on schedule or on demand."
        />
      ) : null}

      {data && data.tasks.length > 0 ? (
        <Card>
          {data.tasks.map((t) => {
            const lr = lastRunByTask.get(t.id);
            return (
              <div key={t.id} className="border-b border-line px-5 py-4 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-medium">
                      {t.name}
                      {!t.enabled ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                          paused
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">{t.prompt}</p>
                    <p className="mt-1.5 text-[13px] text-muted">
                      {cronHuman(t.cron)}
                      {t.skill_ids.length > 0 ? (
                        <> · skills: {t.skill_ids.map((id) => skillName.get(id) ?? "?").join(", ")}</>
                      ) : null}
                      {lr ? (
                        <>
                          {" "}
                          · last run {ago(lr.created_at)}{" "}
                          <Link href={`/runs/${lr.id}`} className="align-middle">
                            <StatusChip status={lr.status} />
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="primary" onClick={() => void act(() => runTask(t.id))}>
                      Run now
                    </Button>
                    <Button onClick={() => setDialog({ kind: "edit", task: t })}>Edit</Button>
                    <Button onClick={() => void toggleEnabled(t)}>
                      {t.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(`Delete task "${t.name}"?`)) {
                          void act(() => deleteTask(t.id));
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      <TaskDialog
        request={dialog}
        skills={data?.skills ?? []}
        onClose={() => setDialog({ kind: "closed" })}
        onSaved={reload}
      />
    </div>
  );
}

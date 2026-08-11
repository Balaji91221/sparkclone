"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { TaskEditor } from "@/components/task-editor";
import { ErrorBanner, Skeleton } from "@/components/ui";
import { listSkills, listTasks } from "@/lib/api";
import type { SkillDef, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

type EditData = { task: Task | null; skills: SkillDef[] };

export default function EditTaskPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const fetchData = useCallback(async (signal: AbortSignal): Promise<EditData> => {
    const [tasks, skills] = await Promise.all([listTasks(signal), listSkills(signal)]);
    return { task: tasks.find((t) => t.id === taskId) ?? null, skills };
  }, [taskId]);
  // One long interval: the editor holds local state, we only need the initial load.
  const { state } = usePoll(fetchData, 3600000);

  if (state.kind === "loading") return <Skeleton rows={4} />;
  if (state.kind === "error") return <ErrorBanner message={state.message} />;
  if (!state.data.task) return <p className="text-sm text-muted">Task not found.</p>;
  return <TaskEditor task={state.data.task} skills={state.data.skills} />;
}

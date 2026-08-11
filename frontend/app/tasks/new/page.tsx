"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { TaskEditor } from "@/components/task-editor";
import { Skeleton } from "@/components/ui";
import { listSkills } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

export default function NewTaskPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <NewTaskInner />
    </Suspense>
  );
}

function NewTaskInner() {
  const params = useSearchParams();
  const fetchSkills = useCallback((signal: AbortSignal) => listSkills(signal), []);
  const { state } = usePoll(fetchSkills, 30000);

  return (
    <TaskEditor
      mode={{
        kind: "create",
        prefill: { name: params.get("name") ?? "", prompt: params.get("prompt") ?? "" },
      }}
      skills={state.kind === "ready" ? state.data : []}
    />
  );
}

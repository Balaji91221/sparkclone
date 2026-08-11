"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTask, updateTask } from "@/lib/api";
import type { TaskInput } from "@/lib/api";
import type { SkillDef, Task } from "@/lib/types";
import { ScheduleField } from "./schedule-field";
import { Button, inputClass } from "./ui";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

type TaskEditorProps = {
  task?: Task;
  prefill?: { name: string; prompt: string };
  skills: SkillDef[];
};

function initialForm(task?: Task, prefill?: TaskEditorProps["prefill"]): TaskInput {
  if (task) {
    return {
      name: task.name,
      prompt: task.prompt,
      skill_ids: task.skill_ids,
      allowed_tools: task.allowed_tools,
      cron: task.cron,
      enabled: task.enabled,
    };
  }
  return {
    name: prefill?.name ?? "",
    prompt: prefill?.prompt ?? "",
    skill_ids: [],
    allowed_tools: [],
    cron: "",
    enabled: true,
  };
}

export function TaskEditor({ task, prefill, skills }: TaskEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<TaskInput>(() => initialForm(task, prefill));
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const toggleSkill = (id: string) => {
    setForm((f) => ({
      ...f,
      skill_ids: f.skill_ids.includes(id)
        ? f.skill_ids.filter((s) => s !== id)
        : [...f.skill_ids, id],
    }));
  };

  const submit = async () => {
    if (!form.prompt.trim()) {
      setSave({ kind: "error", message: "Describe what the agent should do." });
      return;
    }
    setSave({ kind: "saving" });
    try {
      const body = { ...form, name: form.name.trim() || "Untitled task" };
      if (task) await updateTask(task.id, body);
      else await createTask(body);
      setSave({ kind: "saved" });
      window.setTimeout(() => router.push("/tasks"), 500);
    } catch (e: unknown) {
      setSave({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="anim-rise mb-6 flex items-center justify-between" style={{ "--d": "0ms" } as React.CSSProperties}>
        <Link href="/tasks" className="text-sm text-accent hover:underline">
          ← Tasks
        </Link>
        <div className="flex items-center gap-3">
          {save.kind === "saved" ? (
            <span className="text-sm font-medium text-ok">Saved ✓</span>
          ) : null}
          <Button onClick={() => router.push("/tasks")}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={save.kind === "saving"}>
            {save.kind === "saving" ? "Saving…" : task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </div>

      <div className="anim-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Task name"
          className="font-display w-full rounded-xl border border-line bg-surface px-5 py-4
            text-xl font-semibold outline-none placeholder:font-normal
            placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="anim-rise mt-6" style={{ "--d": "160ms" } as React.CSSProperties}>
        <p className="mb-2 text-[13px] font-medium text-muted">When to run</p>
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <ScheduleField
            value={form.cron}
            onChange={(cron) => setForm((f) => ({ ...f, cron }))}
          />
        </div>
      </div>

      <div className="anim-rise mt-6" style={{ "--d": "240ms" } as React.CSSProperties}>
        <p className="mb-2 text-[13px] font-medium text-muted">Instructions</p>
        <textarea
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder="Describe, in as much detail as you like, what the agent should do on every run…"
          className={`${inputClass} min-h-[380px] resize-y rounded-xl px-5 py-4 font-mono
            text-[13px] leading-relaxed`}
        />
        <p className="mt-1.5 text-xs text-muted">
          {form.prompt.length.toLocaleString()} characters
        </p>
      </div>

      <div className="anim-rise mt-4" style={{ "--d": "320ms" } as React.CSSProperties}>
        {skills.length > 0 ? (
          <>
            <p className="mb-2 text-[13px] font-medium text-muted">Attach skills</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => {
                const on = form.skill_ids.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Enabled (scheduled runs fire only when enabled)
        </label>
        {save.kind === "error" ? (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {save.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

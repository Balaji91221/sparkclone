"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTask, rotateWebhookSecret, updateTask } from "@/lib/api";
import type { TaskInput } from "@/lib/api";
import type { SkillDef, Task } from "@/lib/types";
import { ScheduleField } from "./schedule-field";
import type { TriggerValue } from "./schedule-field";
import { Button, inputClass } from "./ui";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export type EditorMode =
  | { kind: "create"; prefill?: { name: string; prompt: string } }
  | { kind: "edit"; task: Task };

type TaskEditorProps = { mode: EditorMode; skills: SkillDef[] };

function initialForm(mode: EditorMode): TaskInput {
  switch (mode.kind) {
    case "edit": {
      const { task } = mode;
      return {
        name: task.name,
        prompt: task.prompt,
        skill_ids: task.skill_ids,
        allowed_tools: task.allowed_tools,
        trigger_type: task.trigger_type,
        trigger_value: task.trigger_value,
        max_retries: task.max_retries,
        enabled: task.enabled,
      };
    }
    case "create":
      return {
        name: mode.prefill?.name ?? "",
        prompt: mode.prefill?.prompt ?? "",
        skill_ids: [],
        allowed_tools: [],
        trigger_type: "manual",
        trigger_value: "",
        max_retries: 0,
        enabled: true,
      };
    default: {
      const _exhaustive: never = mode;
      throw new Error(`unhandled editor mode: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function TaskEditor({ mode, skills }: TaskEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<TaskInput>(() => initialForm(mode));
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
      if (mode.kind === "edit") await updateTask(mode.task.id, body);
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
            <span role="status" className="text-sm font-medium text-ok">Saved ✓</span>
          ) : null}
          <Button onClick={() => router.push("/tasks")}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={save.kind === "saving"}>
            {save.kind === "saving"
              ? "Saving…"
              : mode.kind === "edit"
                ? "Save changes"
                : "Create task"}
          </Button>
        </div>
      </div>

      <div className="anim-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Task name"
          aria-label="Task name"
          className="w-full rounded-xl border border-line bg-surface px-5 py-4
            text-xl font-semibold outline-none placeholder:font-normal
            placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="anim-rise mt-6" style={{ "--d": "160ms" } as React.CSSProperties}>
        <p className="mb-2 text-[13px] font-medium text-muted">When to run</p>
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <ScheduleField
            value={{ trigger_type: form.trigger_type, trigger_value: form.trigger_value }}
            onChange={(v: TriggerValue) => setForm((f) => ({ ...f, ...v }))}
          />
          {form.trigger_type === "webhook" ? (
            <WebhookPanel
              taskId={mode.kind === "edit" ? mode.task.id : null}
              initialUrl={mode.kind === "edit" ? mode.task.webhook_url : null}
            />
          ) : null}
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            Retries on failure
            <select
              value={form.max_retries}
              onChange={(e) => setForm((f) => ({ ...f, max_retries: Number(e.target.value) }))}
              aria-label="Retries on failure"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-sm
                text-foreground outline-none focus:border-accent"
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>{n === 0 ? "None" : n}</option>
              ))}
            </select>
            {form.max_retries > 0 ? (
              <span className="text-xs">failed runs retry with backoff (30s, 60s, 120s)</span>
            ) : null}
          </label>
        </div>
      </div>

      <div className="anim-rise mt-6" style={{ "--d": "240ms" } as React.CSSProperties}>
        <p className="mb-2 text-[13px] font-medium text-muted">Instructions</p>
        <textarea
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder="Describe, in as much detail as you like, what the agent should do on every run…"
          aria-label="Task instructions"
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
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {on ? "✓ " : ""}{s.name}
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
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {save.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type WebhookPanelProps = { taskId: string | null; initialUrl: string | null };

// Shown when the schedule kind is "webhook". The secret URL only exists once
// the task is saved, so create mode just explains that.
function WebhookPanel({ taskId, initialUrl }: WebhookPanelProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [note, setNote] = useState("");

  if (!taskId || !url) {
    return (
      <p className="mt-3 text-xs text-muted">
        Save the task to get its webhook URL — external services POST to it to
        start a run.
      </p>
    );
  }

  const full = `${window.location.origin}${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setNote("Copied.");
    } catch {
      setNote("Copy failed — select the URL manually.");
    }
  };

  const rotate = async () => {
    if (!window.confirm("Rotate the webhook secret? The current URL stops working immediately.")) {
      return;
    }
    try {
      setUrl(await rotateWebhookSecret(taskId));
      setNote("Secret rotated — update any services using the old URL.");
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5">
      <p className="text-xs font-medium text-muted">Webhook URL (POST to start a run)</p>
      <code className="mt-1 block break-all font-mono text-xs">{full}</code>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={() => void copy()}>Copy</Button>
        <Button onClick={() => void rotate()}>Rotate secret</Button>
        {note ? <span role="status" className="text-xs text-muted">{note}</span> : null}
      </div>
    </div>
  );
}

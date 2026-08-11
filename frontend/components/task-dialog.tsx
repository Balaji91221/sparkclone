"use client";

import { useState } from "react";
import { createTask, updateTask } from "@/lib/api";
import type { TaskInput } from "@/lib/api";
import type { SkillDef, Task } from "@/lib/types";
import { Button, Field, Modal, inputClass } from "./ui";

export type TaskDialogRequest =
  | { kind: "closed" }
  | { kind: "create"; prefill?: { name: string; prompt: string } }
  | { kind: "edit"; task: Task };

type TaskDialogProps = {
  request: TaskDialogRequest;
  skills: SkillDef[];
  onClose: () => void;
  onSaved: () => void;
};

// Remount the form whenever the request changes so its state initializes from
// props — no effect-based syncing.
function formKey(request: TaskDialogRequest): string {
  if (request.kind === "edit") return `edit:${request.task.id}`;
  if (request.kind === "create") return `create:${request.prefill?.prompt ?? ""}`;
  return "closed";
}

export function TaskDialog({ request, skills, onClose, onSaved }: TaskDialogProps) {
  return (
    <Modal
      open={request.kind !== "closed"}
      title={request.kind === "edit" ? "Edit task" : "New task"}
      onClose={onClose}
    >
      {request.kind !== "closed" ? (
        <TaskForm
          key={formKey(request)}
          request={request}
          skills={skills}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Modal>
  );
}

type TaskFormProps = {
  request: Exclude<TaskDialogRequest, { kind: "closed" }>;
  skills: SkillDef[];
  onClose: () => void;
  onSaved: () => void;
};

function initialForm(request: TaskFormProps["request"]): TaskInput {
  if (request.kind === "edit") {
    const { task } = request;
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
    name: request.prefill?.name ?? "",
    prompt: request.prefill?.prompt ?? "",
    skill_ids: [],
    allowed_tools: [],
    cron: "",
    enabled: true,
  };
}

function TaskForm({ request, skills, onClose, onSaved }: TaskFormProps) {
  const [form, setForm] = useState<TaskInput>(() => initialForm(request));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleSkill = (id: string) => {
    setForm((f) => ({
      ...f,
      skill_ids: f.skill_ids.includes(id)
        ? f.skill_ids.filter((s) => s !== id)
        : [...f.skill_ids, id],
    }));
  };

  const save = async () => {
    if (!form.prompt.trim()) {
      setError("Describe what the agent should do.");
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, name: form.name.trim() || "Untitled task" };
      if (request.kind === "edit") await updateTask(request.task.id, body);
      else await createTask(body);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <>
      <Field label="Name">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Daily market & commodity news"
        />
      </Field>
      <Field label="What should the agent do?">
        <textarea
          className={`${inputClass} min-h-[110px] resize-y`}
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder="Every run: read my inbox, summarize the important emails, and notify me with a prioritized to-do list."
        />
      </Field>
      <Field
        label="Schedule (cron)"
        hint="Leave empty to run manually. Example: 30 8 * * * = daily 08:30."
      >
        <input
          className={`${inputClass} font-mono`}
          value={form.cron}
          onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
          placeholder="30 8 * * *"
        />
      </Field>
      {skills.length > 0 ? (
        <Field label="Attach skills">
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
        </Field>
      ) : null}
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Enabled (scheduled runs fire only when enabled)
      </label>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : request.kind === "edit" ? "Save changes" : "Create task"}
        </Button>
      </div>
    </>
  );
}

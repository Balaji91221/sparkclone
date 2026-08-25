"use client";

import { useCallback, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/ui";
import { createSkill, deleteSkill, listSkills } from "@/lib/api";
import type { SkillInput } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

const RECOMMENDED: Array<{ title: string; desc: string; input: SkillInput }> = [
  {
    title: "Match your writing style",
    desc: "Learns your voice from your real writing across apps",
    input: {
      name: "match-writing-style",
      description: "Match the user's tone and vocabulary",
      instructions:
        "Learn my voice from my real writing. Match my tone, sentence length and vocabulary in every draft.",
    },
  },
  {
    title: "Focus your energy",
    desc: "Align your workload with your energy instead of your calendar",
    input: {
      name: "focus-your-energy",
      description: "Schedule deep work by energy level",
      instructions:
        "Align my workload with my energy: schedule deep work in the morning, admin after lunch.",
    },
  },
  {
    title: "Get more perspectives",
    desc: "Get 3–5 distinct viewpoints before you commit to a decision",
    input: {
      name: "more-perspectives",
      description: "Multiple viewpoints before recommendations",
      instructions: "Before any recommendation, give 3–5 distinct viewpoints with tradeoffs.",
    },
  },
  {
    title: "Generate fresh ideas",
    desc: "Turn existing content into 5 entirely new creative concepts",
    input: {
      name: "fresh-ideas",
      description: "Creative concept generation",
      instructions: "Turn existing content into 5 entirely new creative concepts.",
    },
  },
];

type DialogState = { kind: "closed" } | { kind: "open"; form: SkillInput };

export default function SkillsPage() {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSkills = useCallback((signal: AbortSignal) => listSkills(signal), []);
  const { state, reload } = usePoll(fetchSkills, 6000);

  const open = (form?: SkillInput) => {
    setError("");
    setSaving(false);
    setDialog({ kind: "open", form: form ?? { name: "", description: "", instructions: "" } });
  };

  const setForm = (patch: Partial<SkillInput>) => {
    setDialog((d) => (d.kind === "open" ? { kind: "open", form: { ...d.form, ...patch } } : d));
  };

  const save = async () => {
    if (dialog.kind !== "open") return;
    const { form } = dialog;
    if (!form.name.trim() || !form.instructions.trim()) {
      setError("Name and instructions are required.");
      return;
    }
    setSaving(true);
    try {
      await createSkill({ ...form, name: form.name.trim() });
      setDialog({ kind: "closed" });
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete skill "${name}"?`)) return;
    try {
      await deleteSkill(id);
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const skills = state.kind === "ready" ? state.data : [];

  return (
    <div>
      <PageHeader
        title="Skills"
        lede="Reusable instruction blocks. Attach them to tasks to shape how the agent works."
        action={
          <Button variant="primary" onClick={() => open()}>
            New skill
          </Button>
        }
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {error && dialog.kind === "closed" ? <ErrorBanner message={error} /> : null}
      {state.kind === "loading" ? <Skeleton rows={2} /> : null}

      {state.kind === "ready" && skills.length === 0 ? (
        <EmptyState
          title="Add your first skill"
          hint="Write custom instructions, or start from a recommended template below."
        />
      ) : null}

      {skills.length > 0 ? (
        <Card>
          {skills.map((s) => (
            <details key={s.id} className="group border-b border-line last:border-0">
              <summary
                className="flex cursor-pointer list-none items-center gap-4 px-5 py-4
                  transition hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted transition-transform
                  group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium">{s.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {s.description || s.instructions.split("\n")[0]}
                  </p>
                </div>
                <Button variant="danger" onClick={() => void remove(s.id, s.name)}>
                  Delete
                </Button>
              </summary>
              <div className="border-t border-line bg-background/50 px-5 py-4 pl-[3.25rem]">
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed
                  text-foreground/90">
                  {s.instructions}
                </pre>
              </div>
            </details>
          ))}
        </Card>
      ) : null}

      <h2 className="mb-3 mt-10 text-[15px] font-semibold">Recommended</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {RECOMMENDED.map((r, i) => (
          <button
            key={r.input.name}
            type="button"
            onClick={() => open(r.input)}
            className="anim-rise hover-lift rounded-xl border border-line bg-surface p-4
              text-left hover:border-accent/50"
            style={{ "--d": `${i * 70}ms` } as React.CSSProperties}
          >
            <p className="text-sm font-medium">{r.title}</p>
            <p className="mt-1 text-[13px] text-muted">{r.desc}</p>
          </button>
        ))}
      </div>

      <Modal
        open={dialog.kind === "open"}
        title="New skill"
        onClose={() => setDialog({ kind: "closed" })}
      >
        {dialog.kind === "open" ? (
          <>
            <Field label="Name" hint="Short and kebab-case, e.g. inbox-digest-style">
              <input
                className={`${inputClass} font-mono`}
                value={dialog.form.name}
                onChange={(e) => setForm({ name: e.target.value })}
                placeholder="inbox-digest-style"
              />
            </Field>
            <Field label="Description" hint="One line shown in the list">
              <input
                className={inputClass}
                value={dialog.form.description}
                onChange={(e) => setForm({ description: e.target.value })}
                placeholder="Turn unread email into a prioritized action list"
              />
            </Field>
            <Field label="Instructions" hint="Markdown, written as directions to the agent">
              <textarea
                className={`${inputClass} min-h-[160px] resize-y font-mono text-[13px]`}
                value={dialog.form.instructions}
                onChange={(e) => setForm({ instructions: e.target.value })}
                placeholder="Group by importance. Flag invoices and deadlines first."
              />
            </Field>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setDialog({ kind: "closed" })}>Cancel</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Create skill"}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

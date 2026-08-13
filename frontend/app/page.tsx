"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Card, Skeleton, StatCard, StatusChip } from "@/components/ui";
import { createChat, listApprovals, listRuns, listTasks, sendChatMessage } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Approval, RunSummary, Task } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

const SUGGESTIONS = [
  {
    title: "Inbox briefing",
    desc: "Turn unread email into a concise daily priority list.",
    cadence: "Every weekday",
    prompt:
      "Declutter my inbox: summarize or archive newsletters and unsubscribe from email lists",
  },
  {
    title: "Research watch",
    desc: "Follow a topic and get a cited briefing when it matters.",
    cadence: "On a schedule",
    prompt:
      "Deep dive on a topic: pull research formatted to fit my goal, complete with cited sources",
  },
  {
    title: "News digest",
    desc: "Track the stories you care about without the noise.",
    cadence: "Daily digest",
    prompt:
      "Build me a custom news digest on the stories I care about and follow how they evolve",
  },
];

const PROMPT_STARTERS = [
  "Plan a weekly review",
  "Research a topic",
  "Organize my inbox",
  "Create a recurring task",
];

type HomeData = {
  tasks: Task[];
  runs: RunSummary[];
  approvals: Approval[];
};

export default function HomePage() {
  const router = useRouter();
  const [quick, setQuick] = useState("");

  const fetchAll = useCallback(async (signal: AbortSignal): Promise<HomeData> => {
    const [tasks, runs, approvals] = await Promise.all([
      listTasks(signal),
      listRuns(signal),
      listApprovals(signal),
    ]);
    return { tasks, runs, approvals };
  }, []);
  const { state } = usePoll(fetchAll, 4000);

  // Gemini-style: describing a task here starts a chat with Astra, who
  // drafts and creates the automation conversationally.
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const startChat = async (message: string) => {
    if (starting) return;
    setStarting(true);
    setStartError("");
    try {
      const id = await createChat();
      await sendChatMessage(id, message);
      router.push(`/chat?id=${id}`);
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const chooseStarter = (starter: string) => {
    setQuick(starter);
    window.requestAnimationFrame(() => document.getElementById("astra-prompt")?.focus());
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
    <div className="relative pt-3 md:pt-7">
      <section className="anim-rise mx-auto mb-8 max-w-3xl text-center" style={{ "--d": "0ms" } as React.CSSProperties}>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-[var(--shadow-card)]">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Your personal agent workspace
        </p>
        <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] md:text-[3.65rem]">
          Make progress without <span className="grad-text">keeping up.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted md:text-base">
          Give Astra a goal in plain language. It plans the work, asks before sensitive actions,
          and keeps your recurring work moving.
        </p>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!quick.trim()) return;
          void startChat(quick.trim());
        }}
        className="anim-rise mx-auto mb-3 max-w-2xl rounded-2xl border border-line bg-surface
          p-2 shadow-[var(--shadow-card)]
          transition duration-150 focus-within:border-accent/40
          focus-within:shadow-[var(--shadow-card-hover)]"
        style={{ "--d": "110ms" } as React.CSSProperties}
      >
        <div className="flex items-end gap-2 px-3 pt-2">
          <span className="mb-2.5 text-accent" aria-hidden>✦</span>
          <textarea
            id="astra-prompt"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Ask Astra to plan, research, organize, or automate anything…"
            className="min-h-[52px] flex-1 resize-none bg-transparent py-1 text-[15px]
              leading-relaxed outline-none placeholder:text-muted/70"
          />
          <button
            type="submit"
            disabled={starting || !quick.trim()}
            className="btn-primary mb-1 rounded-full px-5 py-2 text-sm font-medium
              disabled:cursor-not-allowed disabled:opacity-60"
          >
            {starting ? "Preparing…" : "Start"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
          <span className="text-[11px] text-muted">Astra can use your connected apps and skills.</span>
          <span className="hidden shrink-0 text-[11px] text-muted sm:inline">⌘ / Ctrl + Enter to start</span>
        </div>
      </form>
      {startError ? (
        <p role="alert" className="mx-auto -mt-5 mb-6 max-w-2xl rounded-lg bg-danger-soft
          px-3 py-2 text-sm text-danger">
          {startError}
        </p>
      ) : null}
      <div className="mb-9 flex flex-wrap justify-center gap-2">
        {PROMPT_STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => chooseStarter(starter)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium
              text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            {starter}
          </button>
        ))}
      </div>

      <div
        className="anim-rise mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
        style={{ "--d": "220ms" } as React.CSSProperties}
      >
        <StatCard
          label="Active tasks"
          value={data ? String(data.tasks.filter((t) => t.enabled).length) : "—"}
          hint={data ? `${data.tasks.length} total` : undefined}
          tint="blue"
        />
        <StatCard
          label="Runs recorded"
          value={data ? String(data.runs.length) : "—"}
          tint="green"
        />
        <StatCard
          label="Success rate"
          value={successRate === null ? "—" : `${successRate}%`}
          tone={successRate !== null && successRate >= 80 ? "ok" : "default"}
          hint="of finished runs"
          tint="violet"
        />
        <StatCard
          label="Pending approvals"
          value={data ? String(data.approvals.length) : "—"}
          tone={data && data.approvals.length > 0 ? "warn" : "default"}
          tint="amber"
        />
      </div>

      <div
        className="anim-rise mb-2 flex items-baseline justify-between"
        style={{ "--d": "300ms" } as React.CSSProperties}
      >
        <h2 className="text-[15px] font-semibold tracking-tight">Recent activity</h2>
        <Link href="/runs" className="text-xs font-medium text-accent hover:underline">
          All runs →
        </Link>
      </div>
      {!data ? <Skeleton rows={3} /> : null}
      {data && data.runs.length > 0 ? (
        <div className="anim-rise">
          <Card>
            {data.runs.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="flex items-center justify-between gap-4 border-b border-line px-5
                  py-3.5 transition-colors last:border-0 hover:bg-surface-2"
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
        </div>
      ) : null}
      {data && data.runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-muted">
          No runs yet — create a task above and press Run now.
        </p>
      ) : null}

      <div
        className="anim-rise mb-3 mt-9 flex items-end justify-between gap-4"
        style={{ "--d": "380ms" } as React.CSSProperties}
      >
        <div>
          <h2 className="text-[15px] font-semibold">Start from a template</h2>
          <p className="mt-1 text-[13px] text-muted">A flexible starting point — customize it in chat.</p>
        </div>
        <Link href="/apps" className="shrink-0 text-xs font-medium text-accent hover:underline">Browse apps →</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => void startChat(s.prompt)}
            className="anim-rise hover-lift group rounded-2xl border border-line bg-surface p-4
              text-left shadow-[var(--shadow-card)] hover:border-accent/40"
            style={{ "--d": `${440 + i * 70}ms` } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent-soft text-sm text-accent">✦</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">{s.cadence}</span>
            </div>
            <p className="mt-4 text-sm font-medium">{s.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.desc}</p>
            <p className="mt-3 text-xs font-medium text-accent">Use template <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span></p>
          </button>
        ))}
      </div>
    </div>
  );
}

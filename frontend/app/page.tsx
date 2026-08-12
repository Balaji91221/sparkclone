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

  // Gemini-style: describing a task here starts a chat with Arc, who
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
    <div className="relative pt-6">
      <h1
        className="anim-rise mb-8 text-center text-[2rem] font-semibold leading-[1.1]
          tracking-[-0.02em] md:text-[3.25rem]"
        style={{ "--d": "0ms" } as React.CSSProperties}
      >
        Put <span className="grad-text">Arclight</span> to work for you
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!quick.trim()) return;
          void startChat(quick.trim());
        }}
        className="anim-rise mx-auto mb-10 flex max-w-2xl items-center gap-3 rounded-full
          border border-line bg-surface py-2 pl-6 pr-2 shadow-[var(--shadow-card)]
          transition duration-150 focus-within:border-accent/40
          focus-within:shadow-[var(--shadow-card-hover)]"
        style={{ "--d": "110ms" } as React.CSSProperties}
      >
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Describe a task…"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={starting}
          className="btn-primary rounded-full px-5 py-2 text-sm font-medium
            disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? "Starting…" : "Ask Arc"}
        </button>
      </form>
      {startError ? (
        <p role="alert" className="mx-auto -mt-5 mb-6 max-w-2xl rounded-lg bg-danger-soft
          px-3 py-2 text-sm text-danger">
          {startError}
        </p>
      ) : null}

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

      <h2
        className="anim-rise mb-3 mt-9 text-[15px] font-semibold"
        style={{ "--d": "380ms" } as React.CSSProperties}
      >
        Suggested
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => void startChat(s.prompt)}
            className="anim-rise hover-lift rounded-2xl border border-line bg-surface p-4
              text-left shadow-[var(--shadow-card)] hover:border-accent/40"
            style={{ "--d": `${440 + i * 70}ms` } as React.CSSProperties}
          >
            <p className="text-sm font-medium">{s.title}</p>
            <p className="mt-1 text-[13px] text-muted">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

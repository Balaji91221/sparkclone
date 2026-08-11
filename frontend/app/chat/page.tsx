"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { Button, ErrorBanner, Skeleton } from "@/components/ui";
import {
  createChat,
  deleteChat,
  getChat,
  listChats,
  sendChatMessage,
} from "@/lib/api";
import { ago } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

export default function ChatPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  // Deep link support: /chat?id=<chat> (used by the Overview quick bar).
  const params = useSearchParams();
  const [chatId, setChatId] = useState<string | null>(params.get("id"));
  const [error, setError] = useState("");

  const fetchChats = useCallback((signal: AbortSignal) => listChats(signal), []);
  const { state: chatsState, reload: reloadChats } = usePoll(fetchChats, 8000);
  const chats = chatsState.kind === "ready" ? chatsState.data : [];
  const activeId = chatId ?? chats[0]?.id ?? null;

  const startNew = async () => {
    setError("");
    try {
      const id = await createChat();
      setChatId(id);
      reloadChats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this chat?")) return;
    try {
      await deleteChat(id);
      if (activeId === id) setChatId(null);
      reloadChats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-6">
      <aside className="flex w-52 shrink-0 flex-col">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Recent
          </p>
          <button
            type="button"
            onClick={() => void startNew()}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-accent
              transition hover:bg-accent-soft"
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {chatsState.kind === "loading" ? (
            <div className="skeleton-shimmer h-10 rounded-lg" />
          ) : null}
          {chats.length === 0 && chatsState.kind === "ready" ? (
            <p className="px-2 py-2 text-xs text-muted">No chats yet.</p>
          ) : null}
          {chats.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px]
                transition ${
                  c.id === activeId
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
            >
              <button
                type="button"
                onClick={() => setChatId(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-[11px] opacity-60">
                  {c.status === "thinking" ? "thinking…" : ago(c.updated_at)}
                </p>
              </button>
              <button
                type="button"
                aria-label={`Delete chat ${c.title}`}
                onClick={() => void remove(c.id)}
                className="hidden shrink-0 rounded p-1 text-xs text-muted
                  hover:text-danger group-hover:block"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {error ? <ErrorBanner message={error} /> : null}
        {activeId ? (
          <Conversation chatId={activeId} />
        ) : (
          <EmptyChat onStart={() => void startNew()} />
        )}
      </div>
    </div>
  );
}

function EmptyChat({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative grid flex-1 place-items-center">
      <div className="hero-glow" aria-hidden />
      <div className="anim-rise text-center">
        <p className="font-display text-2xl font-semibold tracking-tight">
          Chat with Spark
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Ask anything, or describe an automation — Spark can create tasks,
          schedules and skills for you right from the conversation.
        </p>
        <div className="mt-5">
          <Button variant="primary" onClick={onStart}>Start chatting</Button>
        </div>
      </div>
    </div>
  );
}

function Conversation({ chatId }: { chatId: string }) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");

  const fetchChat = useCallback(
    (signal: AbortSignal) => getChat(chatId, signal), [chatId]);
  const { state, reload } = usePoll(fetchChat, 2000);
  const chat = state.kind === "ready" ? state.data : null;
  const busy = chat?.status !== "idle" && chat !== null;

  const send = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setSendError("");
    setDraft("");
    try {
      await sendChatMessage(chatId, content);
      reload();
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : String(e));
      setDraft(content);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-1 pt-2">
          {state.kind === "loading" ? <Skeleton rows={3} /> : null}
          {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
          {chat ? (
            chat.messages.length === 0 && !busy ? (
              <p className="mt-10 text-center text-sm text-muted">
                Say hello, or try: “check my inbox every weekday at 9am and send
                me a summary”.
              </p>
            ) : (
              <ActivityFeed
                transcript={chat.messages}
                live={busy}
                finishedOk
                variant="chat"
              />
            )
          ) : null}
        </div>
      </div>

      {sendError ? (
        <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {sendError}
        </p>
      ) : null}
      {chat?.status === "waiting_approval" ? (
        <p className="mb-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
          Spark is waiting for your decision on a sensitive action —{" "}
          <Link href="/approvals" className="font-medium underline">review it</Link>.
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-3 rounded-full
          border border-line bg-surface py-2 pl-5 pr-2 shadow-[var(--shadow-card)]
          transition focus-within:border-accent/60
          focus-within:shadow-[var(--shadow-card-hover)]
          focus-within:ring-2 focus-within:ring-accent/15"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? "Spark is working…" : "Message Spark…"}
          aria-label="Message Spark"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="grad-primary rounded-full px-5 py-2 text-sm font-medium
            hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed
            disabled:opacity-50 disabled:hover:translate-y-0"
        >
          Send
        </button>
      </form>
    </>
  );
}

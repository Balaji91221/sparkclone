"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getChat, sendChatMessage } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { ActivityFeed } from "../activity-feed";
import { Icon, LogoMark } from "../icons";
import { ErrorBanner, Skeleton } from "../ui";
import { Composer } from "./composer";
import { ContextRail } from "./context-rail";

const SUGGESTIONS: Array<{ icon: string; kind: string; text: string }> = [
  { icon: "mail", kind: "Inbox", text: "Summarize my unread email from today" },
  { icon: "clock", kind: "Automation", text: "Every weekday at 9am, send me a briefing of my inbox and calendar" },
  { icon: "calendar", kind: "Calendar", text: "What's on my calendar this week?" },
  { icon: "globe", kind: "Monitor", text: "Watch a website daily and tell me when it changes" },
];

export type ChatStatus = "idle" | "thinking" | "waiting_approval";

function toStatus(s: string | undefined): ChatStatus {
  if (s === "waiting_approval") return "waiting_approval";
  if (s && s !== "idle") return "thinking";
  return "idle";
}

type ToolbarProps = { title: string; status: ChatStatus; onDelete: () => void };

// Slim toolbar across the top of the canvas: title, live status, overflow menu.
function Toolbar({ title, status, onDelete }: ToolbarProps) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b
      border-line/70 px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-[15px] font-semibold">{title}</h1>
        {status === "thinking" ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-2.5 py-0.5
            text-[11px] font-medium text-accent">
            <span className="pulse-soft h-1.5 w-1.5 rounded-full bg-accent" />
            Working
          </span>
        ) : null}
        {status === "waiting_approval" ? (
          <Link
            href="/approvals"
            className="inline-flex items-center gap-2 rounded-full bg-warn-soft px-2.5 py-0.5
              text-[11px] font-medium text-warn hover:underline"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Needs your approval
          </Link>
        ) : null}
      </div>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="Conversation options"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition
            hover:bg-surface-2 hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
        {menu ? (
          <div
            role="menu"
            className="anim-fade absolute right-0 top-10 z-10 min-w-44 rounded-xl border
              border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
              className="w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm
                text-danger transition hover:bg-danger-soft"
            >
              Delete conversation
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="anim-rise mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center py-10">
      <LogoMark className="h-11 w-11" />
      <h2 className="mt-5 text-[1.75rem] font-medium tracking-[-0.02em]">
        <span className="grad-text">Hello.</span> What can we do next?
      </h2>
      <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
        Ask a question or describe an automation. Astra can read your inbox, Drive and
        calendar, and set up recurring tasks from this conversation.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onPick(s.text)}
            style={{ "--d": `${120 + i * 60}ms` } as React.CSSProperties}
            className="anim-rise group flex items-start gap-3 rounded-2xl border border-line
              bg-surface p-4 text-left transition duration-200 hover:border-accent/40
              hover:bg-accent-soft/30 hover:shadow-[var(--shadow-card-hover)]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2
              text-muted transition group-hover:bg-accent-soft group-hover:text-accent">
              <Icon name={s.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em]
                text-muted">
                {s.kind}
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug">{s.text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type ConversationProps = { chatId: string; onDelete: (id: string) => void };

export function Conversation({ chatId, onDelete }: ConversationProps) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");

  const fetchChat = useCallback((signal: AbortSignal) => getChat(chatId, signal), [chatId]);
  const { state, reload } = usePoll(fetchChat, 2000);
  const chat = state.kind === "ready" ? state.data : null;
  const status = toStatus(chat?.status);
  const busy = chat !== null && status !== "idle";

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
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <Toolbar
          title={chat?.title ?? "New conversation"}
          status={status}
          onDelete={() => onDelete(chatId)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col pb-4 pt-8">
            {state.kind === "loading" ? <Skeleton rows={3} /> : null}
            {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
            {chat ? (
              chat.messages.length === 0 && !busy ? (
                <Welcome onPick={setDraft} />
              ) : (
                <ActivityFeed transcript={chat.messages} live={busy} finishedOk variant="chat" />
              )
            ) : null}
          </div>
        </div>

        <div className="relative px-6 pb-5 pt-1">
          <div className="pointer-events-none absolute inset-x-0 -top-10 h-10
            bg-gradient-to-t from-surface to-transparent" />
          {sendError ? (
            <p role="alert" className="mx-auto mb-3 max-w-3xl rounded-xl bg-danger-soft px-4 py-2
              text-sm text-danger">
              {sendError}
            </p>
          ) : null}
          <Composer value={draft} onChange={setDraft} onSend={() => void send()} busy={busy} />
        </div>
      </section>

      <ContextRail transcript={chat?.messages ?? []} status={status} />
    </div>
  );
}

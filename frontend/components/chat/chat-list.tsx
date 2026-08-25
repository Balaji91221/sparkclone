"use client";

import type { ChatSummary } from "@/lib/api";
import { ago, dayBucket } from "@/lib/format";
import { Icon } from "../icons";

type ChatListProps = {
  chats: ChatSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// Flat rail — no card chrome, just a quiet column of recent conversations.
export function ChatList({ chats, loading, activeId, onSelect, onNew, onDelete }: ChatListProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col md:flex">
      <button
        type="button"
        onClick={onNew}
        className="mb-5 inline-flex items-center gap-2 self-start rounded-full bg-surface px-4
          py-2.5 text-sm font-medium shadow-[var(--shadow-card)] transition duration-200
          hover:bg-surface-2 hover:shadow-[var(--shadow-card-hover)]"
      >
        <PlusIcon />
        New chat
      </button>

      <div className="min-h-0 flex-1 space-y-px overflow-y-auto pr-1">
        {loading ? (
          <>
            <div className="skeleton-shimmer h-10 rounded-full" />
            <div className="skeleton-shimmer h-10 rounded-full" />
          </>
        ) : null}
        {!loading && chats.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">No conversations yet.</p>
        ) : null}
        {chats.map((c, i) => {
          const active = c.id === activeId;
          const bucket = dayBucket(c.updated_at);
          const newBucket = i === 0 || dayBucket(chats[i - 1].updated_at) !== bucket;
          const working = c.status !== "idle";
          return (
            <div key={c.id}>
              {newBucket ? (
                <p className={`px-4 pb-1 text-[11px] font-medium text-muted ${i === 0 ? "" : "pt-4"}`}>
                  {bucket}
                </p>
              ) : null}
            <div
              className={`group flex items-center rounded-full pr-1 transition duration-150 ${
                active ? "bg-accent-soft" : "hover:bg-surface-2"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                title={c.title}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-2 pl-4 pr-1
                  text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {working ? (
                  <span className="pulse-soft h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                ) : null}
                <span className={`truncate text-[13px] ${
                  active ? "font-medium text-foreground" : "text-foreground/85"
                }`}>
                  {c.title}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted group-hover:hidden">
                  {working ? "" : ago(c.updated_at)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete chat ${c.title}`}
                onClick={() => onDelete(c.id)}
                className="hidden shrink-0 rounded-full p-1.5 text-muted transition
                  hover:bg-danger-soft hover:text-danger focus:block group-hover:block"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}

// Conversation pane (mail-app style): header with a primary "New" action,
// search, then day-grouped rows. Sits between the app nav and the canvas.
export function ChatList({ chats, loading, activeId, onSelect, onNew, onDelete }: ChatListProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line/70 px-4">
        <h2 className="text-[15px] font-semibold">Chats</h2>
        <button
          type="button"
          onClick={onNew}
          className="btn-primary inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5
            text-[13px] font-medium"
        >
          <PlusIcon />
          New
        </button>
      </div>

      <div className="px-3 pb-2 pt-3">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full rounded-full border border-transparent bg-background py-1.5 pl-9 pr-3
              text-[13px] outline-none transition placeholder:text-muted focus:border-accent
              focus:bg-surface"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1 px-1 pt-1">
            <div className="skeleton-shimmer h-11 rounded-lg" />
            <div className="skeleton-shimmer h-11 rounded-lg" />
            <div className="skeleton-shimmer h-11 rounded-lg" />
          </div>
        ) : null}
        {!loading && visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted">
            {q ? "No chats match." : "No conversations yet."}
          </p>
        ) : null}
        {visible.map((c, i) => {
          const active = c.id === activeId;
          const working = c.status !== "idle";
          const bucket = dayBucket(c.updated_at);
          const newBucket = i === 0 || dayBucket(visible[i - 1].updated_at) !== bucket;
          return (
            <div key={c.id}>
              {newBucket ? (
                <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em]
                  text-muted ${i === 0 ? "pt-1" : "pt-4"}`}>
                  {bucket}
                </p>
              ) : null}
              <div
                className={`group relative flex items-center rounded-lg pr-1 transition duration-150 ${
                  active ? "bg-accent-soft" : "hover:bg-background"
                }`}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  title={c.title}
                  className="flex min-w-0 flex-1 flex-col py-2 pl-3 pr-1 text-left"
                >
                  <span className={`truncate text-[13.5px] ${
                    active ? "font-semibold" : "font-medium text-foreground/90"
                  }`}>
                    {c.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    {working ? (
                      <>
                        <span className="pulse-soft h-1.5 w-1.5 rounded-full bg-accent" />
                        Working…
                      </>
                    ) : (
                      ago(c.updated_at)
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete chat ${c.title}`}
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition
                    hover:bg-danger-soft hover:text-danger focus-visible:opacity-100
                    group-hover:opacity-100"
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

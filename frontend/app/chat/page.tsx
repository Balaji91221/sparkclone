"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { ChatList } from "@/components/chat/chat-list";
import { Conversation } from "@/components/chat/conversation";
import { LogoMark } from "@/components/icons";
import { Button, ErrorBanner, Skeleton } from "@/components/ui";
import { createChat, deleteChat, listChats } from "@/lib/api";
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
    <div className="flex h-[calc(100dvh-8.5rem)] gap-6 md:h-[calc(100vh-4rem)]">
      <ChatList
        chats={chats}
        loading={chatsState.kind === "loading"}
        activeId={activeId}
        onSelect={setChatId}
        onNew={() => void startNew()}
        onDelete={(id) => void remove(id)}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {error ? <ErrorBanner message={error} /> : null}
        {activeId ? (
          <Conversation chatId={activeId} onDelete={(id) => void remove(id)} />
        ) : (
          <EmptyChat onStart={() => void startNew()} />
        )}
      </div>
    </div>
  );
}

function EmptyChat({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="anim-rise text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <p className="mt-5 text-2xl font-medium tracking-[-0.02em]">Chat with Astra</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Ask anything, or describe an automation — Astra can create tasks,
          schedules and skills for you right from the conversation.
        </p>
        <div className="mt-5">
          <Button variant="primary" onClick={onStart}>Start a conversation</Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { clearToken, getToken, listApprovals, subscribeToken } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Login } from "./login";
import { Sidebar } from "./sidebar";

const serverSnapshot = () => "";

export function AppShell({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeToken, getToken, serverSnapshot);

  if (!token) return <Login />;
  return <ConnectedShell>{children}</ConnectedShell>;
}

function ConnectedShell({ children }: { children: ReactNode }) {
  const fetchApprovals = useCallback((signal: AbortSignal) => listApprovals(signal), []);
  const { state } = usePoll(fetchApprovals, 5000);
  const pending = state.kind === "ready" ? state.data.length : 0;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar pendingApprovals={pending} onSignOut={clearToken} />
      <main className="ml-[220px] px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

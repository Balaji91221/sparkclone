"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { clearToken, getToken, googleStatus, listApprovals, subscribeToken } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Login } from "./login";
import { Sidebar } from "./sidebar";

const serverSnapshot = () => "";

export function AppShell({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeToken, getToken, serverSnapshot);

  if (!token) return <Login />;
  return <ConnectedShell>{children}</ConnectedShell>;
}

type ShellData = { pendingApprovals: number; googleEmail: string };

function ConnectedShell({ children }: { children: ReactNode }) {
  const fetchShellData = useCallback(async (signal: AbortSignal): Promise<ShellData> => {
    const [approvals, google] = await Promise.all([
      listApprovals(signal),
      googleStatus(signal).catch(() => ({ connected: false, email: "", scopes: [] })),
    ]);
    return {
      pendingApprovals: approvals.length,
      googleEmail: google.connected ? google.email : "",
    };
  }, []);
  const { state } = usePoll(fetchShellData, 5000);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        pendingApprovals={data?.pendingApprovals ?? 0}
        googleEmail={data?.googleEmail ?? ""}
        onSignOut={clearToken}
      />
      <main className="ml-[232px] px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

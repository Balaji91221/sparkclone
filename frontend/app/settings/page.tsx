"use client";

import { useCallback, useState } from "react";
import { MCPSettings } from "@/components/mcp-settings";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { googleDisconnect, googleStatus, listAgentTools } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

type Health = { kind: "ok" } | { kind: "down"; message: string };

async function checkHealth(signal: AbortSignal): Promise<Health> {
  try {
    const res = await fetch("/health", { signal });
    return res.ok ? { kind: "ok" } : { kind: "down", message: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { kind: "down", message: e instanceof Error ? e.message : String(e) };
  }
}


export default function SettingsPage() {
  const fetchHealth = useCallback((signal: AbortSignal) => checkHealth(signal), []);
  const { state } = usePoll(fetchHealth, 10000);
  const health = state.kind === "ready" ? state.data : null;

  return (
    <div>
      <PageHeader title="Settings" lede="Connections, tools, and backend status." />

      <h2 className="mb-3 text-[15px] font-semibold">Backend</h2>
      <Card>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium">FastAPI server</p>
            <p className="text-[13px] text-muted">Proxied from this dashboard to the API server</p>
          </div>
          {health?.kind === "ok" ? (
            <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
              online
            </span>
          ) : (
            <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
              {health ? `offline — ${health.message}` : "checking…"}
            </span>
          )}
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold">Google account</h2>
      <GoogleCard />

      <MCPSettings />

      <AgentToolsSection />
    </div>
  );
}

function GoogleCard() {
  const [error, setError] = useState("");
  const fetchStatus = useCallback((signal: AbortSignal) => googleStatus(signal), []);
  const { state, reload } = usePoll(fetchStatus, 8000);
  const status = state.kind === "ready" ? state.data : null;

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google? Stored tokens are revoked and deleted.")) return;
    setError("");
    try {
      await googleDisconnect();
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-sm font-medium">Gmail &amp; Drive</p>
          <p className="max-w-md text-[13px] text-muted">
            {status?.connected
              ? `Connected as ${status.email}. The agent can read Gmail and Drive, and send
                 mail with your approval.`
              : "Sign in with Google to let the agent read your inbox and Drive files."}
          </p>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
        {status?.connected ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
              connected
            </span>
            <Button onClick={() => void disconnect()}>Disconnect</Button>
          </div>
        ) : (
          <Button
            variant="primary"
            // Backend route (proxied), not a Next.js page — full-page navigation
            // is required so Google's redirects can take over.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onClick={() => window.location.assign(`${window.location.origin}/auth/google/login`)}
            disabled={!status}
          >
            Connect Google
          </Button>
        )}
      </div>
    </Card>
  );
}

function AgentToolsSection() {
  const fetchTools = useCallback((signal: AbortSignal) => listAgentTools(signal), []);
  const { state } = usePoll(fetchTools, 30000);

  return (
    <div>
      <h2 className="mb-3 mt-8 text-[15px] font-semibold">Agent tools</h2>
      {state.kind === "loading" ? <Skeleton rows={4} /> : null}
      {state.kind === "error" ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>
      ) : null}
      {state.kind === "ready" ? (
        <Card>
          {state.data.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-4 border-b border-line px-5
                py-3.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium">
                  
                  {t.name}
                </p>
                <p className="line-clamp-1 text-[13px] text-muted">
                  {t.source !== "builtin" ? `via ${t.source} · ` : ""}
                  {t.description}
                </p>
              </div>
              {t.requires_approval ? (
                <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                  approval required
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
                  auto
                </span>
              )}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

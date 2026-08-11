"use client";

import { useCallback } from "react";
import { Card, PageHeader } from "@/components/ui";
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

const TOOLS: Array<{ name: string; desc: string; gated: boolean }> = [
  { name: "read_inbox", desc: "Fetch and summarize recent mail (IMAP fallback)", gated: false },
  { name: "send_email", desc: "Outbound mail — always asks you first", gated: true },
  { name: "web_fetch", desc: "Fetch page content as untrusted data", gated: false },
  { name: "run_python", desc: "Sandboxed code execution with timeout", gated: false },
  { name: "notify", desc: "Deliver results to you", gated: false },
];

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
            <p className="text-[13px] text-muted">Proxied from this dashboard to :8000</p>
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
      <Card>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Gmail &amp; Drive</p>
            <p className="max-w-md text-[13px] text-muted">
              Sign in with Google to let the agent read your inbox and Drive files. The
              OAuth backend ships in the next phase — credentials are already configured
              in <code className="font-mono">.env</code>.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-full border border-line bg-surface-2 px-4
              py-1.5 text-[13px] font-medium text-muted"
            title="Coming in Phase 1/2 of the Google integration plan"
          >
            Not connected
          </button>
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold">Agent tools</h2>
      <Card>
        {TOOLS.map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between gap-4 border-b border-line px-5
              py-3.5 last:border-0"
          >
            <div>
              <p className="font-mono text-sm font-medium">{t.name}</p>
              <p className="text-[13px] text-muted">{t.desc}</p>
            </div>
            {t.gated ? (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                approval required
              </span>
            ) : (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
                auto
              </span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

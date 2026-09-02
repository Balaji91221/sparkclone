"use client";

// Connectors gallery: every service Astra can talk to. Connecting one verifies
// the credentials against the real service, then its tools become available to
// the agent on the next run.

import { useCallback, useState } from "react";
import { ConnectorCard } from "@/components/connector-card";
import { ConnectorDialog } from "@/components/connector-dialog";
import { Icon } from "@/components/icons";
import { Button, ErrorBanner, PageHeader, Skeleton } from "@/components/ui";
import { googleDisconnect, googleStatus, listConnectors } from "@/lib/api";
import type { ConnectorInfo, GoogleStatus } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

type Data = { connectors: ConnectorInfo[]; google: GoogleStatus | null };

export default function ConnectorsPage() {
  const fetchAll = useCallback(async (signal: AbortSignal): Promise<Data> => {
    const [connectors, google] = await Promise.all([
      listConnectors(signal),
      googleStatus(signal).catch(() => null),
    ]);
    return { connectors, google };
  }, []);
  const { state, reload } = usePoll(fetchAll, 15000);
  const data = state.kind === "ready" ? state.data : null;
  const [editing, setEditing] = useState<ConnectorInfo | null>(null);

  return (
    <div>
      <PageHeader
        title="Connectors"
        lede="Connect the services you use. Astra gains their tools, delivers results
          there, and always asks before sending anything on your behalf."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={3} /> : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <GoogleCard status={data.google} onChanged={reload} />
          {data.connectors.map((c) => (
            <ConnectorCard
              key={c.kind}
              connector={c}
              onChanged={reload}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-[13px] text-muted">
        Credentials are encrypted before they are stored and never leave this server.
        Need something else? Add any MCP server in Settings → Integrations.
      </p>

      {editing ? (
        <ConnectorDialog
          connector={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function GoogleCard({ status, onChanged }: { status: GoogleStatus | null; onChanged: () => void }) {
  const [error, setError] = useState("");

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google? Stored tokens are revoked and deleted.")) return;
    setError("");
    try {
      await googleDisconnect();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const tools = "read_gmail, send_gmail, list_drive_files, read_drive_file, list_calendar_events, create_calendar_event";

  return (
    <div
      className="flex flex-col rounded-2xl border border-line bg-surface p-5
        shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint-blue
            text-accent"
        >
          <Icon name="google" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Google</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Gmail, Drive and Calendar through one sign-in.
          </p>
        </div>
        {status?.connected ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ok-soft
            px-2.5 py-0.5 text-xs font-medium text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Connected
          </span>
        ) : null}
      </div>

      {status?.connected ? (
        <p className="mt-3 truncate text-[13px] text-muted">As {status.email}</p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted">
        6 tools · 2 need approval: <span className="font-mono">{tools}</span>
      </p>
      {status?.connected && !status.scopes.some((s) => s.includes("calendar")) ? (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Calendar permission is missing — disconnect and reconnect to grant it.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        {status?.connected ? (
          <Button variant="danger" onClick={() => void disconnect()}>
            Disconnect
          </Button>
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
    </div>
  );
}

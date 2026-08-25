"use client";

import { useCallback, useState } from "react";
import { AgentToolsSection } from "@/components/agent-tools";
import { MCPSettings } from "@/components/mcp-settings";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import {
  getNotificationSettings,
  googleDisconnect,
  googleStatus,
  updateNotificationSettings,
} from "@/lib/api";
import type { NotificationSettings } from "@/lib/api";
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

      <h2 className="mb-3 mt-8 text-[15px] font-semibold">Notifications</h2>
      <NotificationsCard />

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
          <p className="text-sm font-medium">Gmail, Drive &amp; Calendar</p>
          <p className="max-w-md text-[13px] text-muted">
            {status?.connected
              ? `Connected as ${status.email}. The agent can read Gmail, Drive, and Calendar,
                 and send mail or create events with your approval.`
              : "Sign in with Google to let the agent read your inbox, Drive files, and calendar."}
          </p>
          {status?.connected && !status.scopes.some((s) => s.includes("calendar")) ? (
            <p className="mt-1 max-w-md text-xs text-warn">
              Calendar permission is missing (added after you connected) — disconnect and
              reconnect Google to grant it.
            </p>
          ) : null}
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

const NOTIFY_TOGGLES: Array<{
  key: keyof Omit<NotificationSettings, "delivery" | "failure_cooldown_minutes">;
  label: string;
  hint: string;
}> = [
  {
    key: "notify_on_final_failure",
    label: "Task failed",
    hint: "After the last retry of a scheduled task fails",
  },
  {
    key: "notify_on_pending_approval",
    label: "Approval needed (runs)",
    hint: "A background run is paused on a sensitive action",
  },
  {
    key: "notify_on_chat_approval",
    label: "Approval needed (chat)",
    hint: "Usually off — you are already in the conversation",
  },
];

function NotificationsCard() {
  const [error, setError] = useState("");
  const fetchSettings = useCallback(
    (signal: AbortSignal) => getNotificationSettings(signal),
    [],
  );
  // No interval: settings only change through this card.
  const { state, reload } = usePoll(fetchSettings, null);
  const prefs = state.kind === "ready" ? state.data : null;

  const save = async (next: Omit<NotificationSettings, "delivery">) => {
    setError("");
    try {
      await updateNotificationSettings(next);
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!prefs) {
    return (
      <Card>
        <div className="px-5 py-4">
          {state.kind === "error" ? (
            <p className="text-sm text-danger">{state.message}</p>
          ) : (
            <Skeleton rows={3} />
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {NOTIFY_TOGGLES.map((t) => (
        <label
          key={t.key}
          className="flex cursor-pointer items-center justify-between gap-4 border-b
            border-line px-5 py-3.5"
        >
          <div>
            <p className="text-sm font-medium">{t.label}</p>
            <p className="text-[13px] text-muted">{t.hint}</p>
          </div>
          <input
            type="checkbox"
            checked={prefs[t.key]}
            onChange={(e) => void save({ ...prefs, [t.key]: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      ))}
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <div>
          <p className="text-sm font-medium">Failure cooldown</p>
          <p className="text-[13px] text-muted">
            Minimum minutes between failure emails for the same task
          </p>
        </div>
        <input
          type="number"
          min={0}
          max={1440}
          defaultValue={prefs.failure_cooldown_minutes}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            const minutes = Math.max(0, Math.min(1440, Number(e.target.value) || 0));
            if (minutes !== prefs.failure_cooldown_minutes) {
              void save({ ...prefs, failure_cooldown_minutes: minutes });
            }
          }}
          className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right
            text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="px-5 py-3.5">
        <p className="text-[13px] text-muted">
          {prefs.delivery === "email"
            ? "Delivered by email to your configured NOTIFY_EMAIL."
            : "No NOTIFY_EMAIL configured — notifications only appear in the server log."}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
    </Card>
  );
}


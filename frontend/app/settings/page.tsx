"use client";

import { useCallback, useState } from "react";
import { AgentToolsSection } from "@/components/agent-tools";
import { MCPSettings } from "@/components/mcp-settings";
import { Icon } from "@/components/icons";
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
      <PageHeader title="Settings" lede="Connections, notifications, integrations and what the agent can do." />

      <div className="flex gap-10">
        <SectionNav />
        <div className="min-w-0 flex-1 space-y-10">
          <Section id="backend" title="Backend" lede="Where this dashboard sends its requests.">
            <Card>
              <div className="flex items-center gap-4 px-5 py-4">
                <Tile icon="server" className="bg-surface-2 text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">FastAPI server</p>
                  <p className="text-[13px] text-muted">Proxied from this dashboard to the API server</p>
                </div>
                {health?.kind === "ok" ? (
                  <Pill tone="ok">Online</Pill>
                ) : (
                  <Pill tone="danger">{health ? `Offline — ${health.message}` : "Checking…"}</Pill>
                )}
              </div>
            </Card>
          </Section>

          <Section id="google" title="Google account"
            lede="One sign-in covers the dashboard and the agent's access to Gmail, Drive and Calendar.">
            <GoogleCard />
          </Section>

          <Section id="notifications" title="Notifications" lede="When Astra should email you.">
            <NotificationsCard />
          </Section>

          <Section id="mcp" title="Integrations" lede="MCP servers extend what the agent can call.">
            <MCPSettings />
          </Section>

          <Section id="tools" title="Agent tools" lede="Reference for everything the agent can call right now.">
            <AgentToolsSection />
          </Section>
        </div>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "backend", label: "Backend" },
  { id: "google", label: "Google account" },
  { id: "notifications", label: "Notifications" },
  { id: "mcp", label: "Integrations" },
  { id: "tools", label: "Agent tools" },
];

function SectionNav() {
  return (
    <nav aria-label="Settings sections" className="sticky top-8 hidden w-44 shrink-0 self-start lg:block">
      <ul className="space-y-0.5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded-lg px-3 py-1.5 text-[13px] text-muted transition
                hover:bg-surface-2 hover:text-foreground"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type SectionProps = { id: string; title: string; lede: string; children: React.ReactNode };

function Section({ id, title, lede, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mb-3 text-[13px] text-muted">{lede}</p>
      {children}
    </section>
  );
}

function Tile({ icon, className }: { icon: string; className: string }) {
  return (
    <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${className}`}>
      <Icon name={icon} className="h-5 w-5" />
    </span>
  );
}

const PILL: Record<"ok" | "danger" | "muted", string> = {
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-muted",
};

function Pill({ tone, children }: { tone: keyof typeof PILL; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs
      font-medium ${PILL[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
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
      <div className="flex items-center gap-4 px-5 py-4">
        <Tile icon="google" className="bg-tint-blue text-accent" />
        <div className="min-w-0 flex-1">
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
            <Pill tone="ok">Connected</Pill>
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


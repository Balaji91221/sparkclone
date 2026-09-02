"use client";

import { useState } from "react";
import {
  disconnectConnector,
  testConnector,
  toggleConnector,
  toggleConnectorNotify,
} from "@/lib/api";
import type { ConnectorInfo } from "@/lib/api";
import { Icon } from "./icons";
import { Button } from "./ui";

type Props = { connector: ConnectorInfo; onChanged: () => void; onEdit: () => void };

type Note = { kind: "none" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

export function ConnectorCard({ connector, onChanged, onEdit }: Props) {
  const [note, setNote] = useState<Note>({ kind: "none" });
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setNote({ kind: "none" });
    try {
      await fn();
      if (ok) setNote({ kind: "ok", text: ok });
      onChanged();
    } catch (e: unknown) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const test = () =>
    act(async () => {
      const identity = await testConnector(connector.kind);
      setNote({ kind: "ok", text: `Working — ${identity}` });
    });

  const remove = () => {
    if (!window.confirm(`Disconnect ${connector.name}? Its stored credentials are deleted.`)) {
      return;
    }
    void act(() => disconnectConnector(connector.kind));
  };

  const gated = connector.tools.filter((t) => t.requires_approval).length;

  return (
    <div
      className="flex flex-col rounded-2xl border border-line bg-surface p-5
        shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft
            text-accent"
        >
          <Icon name={connector.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {connector.name}
            {connector.connected && !connector.enabled ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium
                text-muted">
                paused
              </span>
            ) : null}
            {connector.notify ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium
                text-accent">
                notifications
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{connector.description}</p>
        </div>
        {connector.connected ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5
              text-xs font-medium ${
                connector.enabled ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"
              }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Connected
          </span>
        ) : null}
      </div>

      {connector.connected && connector.identity ? (
        <p className="mt-3 truncate text-[13px] text-muted">As {connector.identity}</p>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-muted">
        {connector.tools.length} tool{connector.tools.length === 1 ? "" : "s"}
        {gated > 0 ? ` · ${gated} need approval` : ""}
        {connector.tools.length > 0 ? ": " : ""}
        <span className="font-mono">{connector.tools.map((t) => t.name).join(", ")}</span>
      </p>

      {connector.error ? (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {connector.error}
        </p>
      ) : null}
      {note.kind !== "none" ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            note.kind === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
          }`}
        >
          {note.text}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        {connector.connected ? (
          <>
            <Button onClick={() => void test()} disabled={busy}>
              Test
            </Button>
            <Button onClick={onEdit} disabled={busy}>
              Edit
            </Button>
            <Button onClick={() => void act(() => toggleConnector(connector.kind))} disabled={busy}>
              {connector.enabled ? "Pause" : "Resume"}
            </Button>
            {connector.supports_notify ? (
              <Button
                onClick={() => void act(() => toggleConnectorNotify(connector.kind))}
                disabled={busy}
              >
                {connector.notify ? "Stop notifying" : "Notify here"}
              </Button>
            ) : null}
            <Button variant="danger" onClick={remove} disabled={busy}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onEdit}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

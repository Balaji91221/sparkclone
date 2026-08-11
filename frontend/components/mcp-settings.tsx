"use client";

import { useCallback, useState } from "react";
import {
  addMcpServer,
  deleteMcpServer,
  listMcpServers,
  toggleMcpApproval,
  toggleMcpServer,
} from "@/lib/api";
import type { MCPServerInput } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Button, Card, Field, Modal, inputClass } from "./ui";

const EMPTY: MCPServerInput = {
  name: "", transport: "stdio", command: "", args: [], env: {}, url: "",
  requires_approval: true,
};

type DialogState = { kind: "closed" } | { kind: "open"; form: MCPServerInput; argsText: string };

export function MCPSettings() {
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchServers = useCallback((signal: AbortSignal) => listMcpServers(signal), []);
  const { state, reload } = usePoll(fetchServers, 15000);
  const servers = state.kind === "ready" ? state.data : [];

  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setForm = (patch: Partial<MCPServerInput>, argsText?: string) => {
    setDialog((d) => d.kind === "open"
      ? { kind: "open", form: { ...d.form, ...patch }, argsText: argsText ?? d.argsText }
      : d);
  };

  const save = async () => {
    if (dialog.kind !== "open") return;
    setBusy(true);
    setError("");
    try {
      const args = dialog.argsText.split(/\s+/).filter(Boolean);
      await addMcpServer({ ...dialog.form, args });
      setDialog({ kind: "closed" });
      reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">MCP servers</h2>
        <Button variant="primary" onClick={() => {
          setError("");
          setDialog({ kind: "open", form: EMPTY, argsText: "" });
        }}>
          Connect server
        </Button>
      </div>
      <p className="mb-3 max-w-xl text-xs text-muted">
        Tools from connected MCP servers become callable by the agent. Only add servers
        you trust — their tool descriptions and outputs enter the agent&apos;s context.
      </p>
      {error && dialog.kind === "closed" ? (
        <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {servers.length === 0 && state.kind === "ready" ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-5 text-sm text-muted">
          No MCP servers connected. Try the bundled demo:
          command <code className="font-mono">python3</code>, arguments{" "}
          <code className="font-mono">scripts/demo_mcp_server.py</code>.
        </p>
      ) : null}

      {servers.length > 0 ? (
        <Card>
          {servers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-4 border-b border-line px-5
                py-3.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden>🔌</span> {s.name}
                  <code className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                    {s.transport}
                  </code>
                  {!s.enabled ? (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      disabled
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted">
                  {s.transport === "stdio" ? `${s.command} ${s.args.join(" ")}` : s.url}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    s.requires_approval ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"
                  }`}
                >
                  {s.requires_approval ? "approval required" : "auto"}
                </span>
                <Button onClick={() => void act(() => toggleMcpApproval(s.id))}>
                  {s.requires_approval ? "Make auto" : "Require approval"}
                </Button>
                <Button onClick={() => void act(() => toggleMcpServer(s.id))}>
                  {s.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Remove MCP server "${s.name}"?`)) {
                      void act(() => deleteMcpServer(s.id));
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <Modal
        open={dialog.kind === "open"}
        title="Connect MCP server"
        onClose={() => setDialog({ kind: "closed" })}
      >
        {dialog.kind === "open" ? (
          <>
            <Field label="Name" hint="Short identifier; becomes part of tool names (mcp_<name>_<tool>).">
              <input
                className={`${inputClass} font-mono`}
                value={dialog.form.name}
                onChange={(e) => setForm({ name: e.target.value })}
                placeholder="my-server"
              />
            </Field>
            <Field label="Transport">
              <select
                value={dialog.form.transport}
                onChange={(e) =>
                  setForm({ transport: e.target.value === "http" ? "http" : "stdio" })}
                className={inputClass}
              >
                <option value="stdio">stdio — local command</option>
                <option value="http">http — streamable HTTP URL</option>
              </select>
            </Field>
            {dialog.form.transport === "stdio" ? (
              <>
                <Field label="Command">
                  <input
                    className={`${inputClass} font-mono`}
                    value={dialog.form.command}
                    onChange={(e) => setForm({ command: e.target.value })}
                    placeholder="python3"
                  />
                </Field>
                <Field label="Arguments" hint="Space-separated.">
                  <input
                    className={`${inputClass} font-mono`}
                    value={dialog.argsText}
                    onChange={(e) => setForm({}, e.target.value)}
                    placeholder="scripts/demo_mcp_server.py"
                  />
                </Field>
              </>
            ) : (
              <Field label="URL">
                <input
                  className={`${inputClass} font-mono`}
                  value={dialog.form.url}
                  onChange={(e) => setForm({ url: e.target.value })}
                  placeholder="https://example.com/mcp"
                />
              </Field>
            )}
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dialog.form.requires_approval}
                onChange={(e) => setForm({ requires_approval: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Pause for my approval before every tool call (recommended)
            </label>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setDialog({ kind: "closed" })}>Cancel</Button>
              <Button variant="primary" onClick={() => void save()} disabled={busy}>
                {busy ? "Testing connection…" : "Connect"}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

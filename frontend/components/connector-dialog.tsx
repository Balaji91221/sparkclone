"use client";

import { useState } from "react";
import { connectConnector } from "@/lib/api";
import type { ConnectorInfo } from "@/lib/api";
import { Button, Modal, inputClass } from "./ui";

type Props = { connector: ConnectorInfo; onClose: () => void; onSaved: () => void };

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

// Secrets start blank even when stored: the backend keeps the saved value for
// any secret field submitted empty, so re-editing never re-pastes a token.
function initialValues(connector: ConnectorInfo): Record<string, string> {
  return Object.fromEntries(connector.fields.map((f) => [f.key, f.secret ? "" : f.value]));
}

export function ConnectorDialog({ connector, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(connector));
  const [notify, setNotify] = useState(connector.notify);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const submit = async () => {
    setSave({ kind: "saving" });
    try {
      await connectConnector(connector.kind, values, connector.supports_notify ? notify : undefined);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setSave({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Modal open title={`Connect ${connector.name}`} onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          {connector.description}
          {connector.docs_url ? (
            <>
              {" "}
              <a
                href={connector.docs_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Get credentials →
              </a>
            </>
          ) : null}
        </p>

        {connector.fields.map((f) => (
          <label key={f.key} className="mb-4 block">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">
              {f.label}
              {f.required ? null : <span className="ml-1 text-muted/70">(optional)</span>}
            </span>
            <input
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              autoComplete="off"
              placeholder={f.secret && f.has_value ? "•••••••• (saved)" : f.placeholder}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              className={inputClass}
            />
            {f.hint ? <span className="mt-1 block text-xs text-muted">{f.hint}</span> : null}
          </label>
        ))}

        {connector.supports_notify ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line
            bg-surface px-4 py-3">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotify(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium">Send notifications here</span>
              <span className="block text-[13px] text-muted">
                Task digests and alerts are delivered to this service.
              </span>
            </span>
          </label>
        ) : null}

        {connector.notes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs leading-relaxed text-muted">
            {connector.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        ) : null}

        {save.kind === "error" ? (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {save.message}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={save.kind === "saving"}>
          {save.kind === "saving" ? "Verifying…" : "Connect"}
        </Button>
      </div>
    </Modal>
  );
}

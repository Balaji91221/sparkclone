"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Button, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { decideApproval, listApprovals } from "@/lib/api";
import { ago } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";

export default function ApprovalsPage() {
  const [actionError, setActionError] = useState("");
  const fetchApprovals = useCallback((signal: AbortSignal) => listApprovals(signal), []);
  const { state, reload } = usePoll(fetchApprovals, 3000);

  const decide = async (id: string, decision: "approve" | "deny") => {
    setActionError("");
    try {
      await decideApproval(id, decision);
      reload();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const approvals = state.kind === "ready" ? state.data : [];

  return (
    <div>
      <PageHeader
        title="Approvals"
        lede="Sensitive tool calls pause here until you approve or deny them. The run resumes with your decision."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      {state.kind === "ready" && approvals.length === 0 ? (
        <EmptyState title="Nothing waiting on you" hint="Runs needing a decision will show up here." />
      ) : null}

      <div className="space-y-4">
        {approvals.map((a) => (
          <div key={a.id} className="rounded-xl border border-warn/40 bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-medium">
                Agent wants to call{" "}
                <span
                  className="rounded-full bg-warn-soft px-2.5 py-0.5 font-mono text-sm
                    font-medium text-warn"
                >
                  {a.tool_name}
                </span>
              </p>
              <span className="text-xs text-muted">
                {ago(a.created_at)} ·{" "}
                <Link href={`/runs/${a.run_id}`} className="text-accent hover:underline">
                  view run
                </Link>
              </span>
            </div>
            <pre
              className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg
                bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted"
            >
              {JSON.stringify(a.tool_input, null, 2)}
            </pre>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => void decide(a.id, "approve")}>
                Approve
              </Button>
              <Button variant="danger" onClick={() => void decide(a.id, "deny")}>
                Deny
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

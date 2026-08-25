"use client";

import { useCallback, useMemo, useState } from "react";
import { listAgentTools } from "@/lib/api";
import type { AgentTool } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Card, Skeleton } from "./ui";

const BUILTIN = "builtin";

type ToolGroup = {
  source: string;
  label: string;
  tools: AgentTool[];
  approvalCount: number;
  unreachable: boolean;
};

// MCP tools are exposed as `mcp_<server>_<tool>` so the model gets a unique,
// API-safe name. Humans only need the tool part; the server is the group.
function displayName(tool: AgentTool): string {
  if (tool.source === BUILTIN) return tool.name;
  const prefix = `mcp_${tool.source}_`;
  return tool.name.startsWith(prefix) ? tool.name.slice(prefix.length) : tool.name;
}

function groupBySource(tools: AgentTool[]): ToolGroup[] {
  const map = new Map<string, AgentTool[]>();
  for (const t of tools) {
    const list = map.get(t.source) ?? [];
    list.push(t);
    map.set(t.source, list);
  }
  const groups = [...map.entries()].map(([source, list]) => ({
    source,
    label: source === BUILTIN ? "Built-in" : source,
    tools: list,
    approvalCount: list.filter((t) => t.requires_approval).length,
    unreachable: list.length === 1 && list[0].description.startsWith("(server unreachable"),
  }));
  // Built-in first, then MCP servers alphabetically.
  return groups.sort((a, b) => {
    if (a.source === BUILTIN) return -1;
    if (b.source === BUILTIN) return 1;
    return a.label.localeCompare(b.label);
  });
}

function matches(tool: AgentTool, query: string): boolean {
  const q = query.toLowerCase();
  return (
    displayName(tool).toLowerCase().includes(q) ||
    tool.description.toLowerCase().includes(q)
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ApprovalBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
      {count} need approval
    </span>
  );
}

function ToolRow({ tool }: { tool: AgentTool }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] font-medium" title={tool.name}>
          {displayName(tool)}
        </p>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">{tool.description}</p>
      </div>
      {tool.requires_approval ? (
        <span className="mt-0.5 shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px]
          font-medium text-warn">
          approval
        </span>
      ) : (
        <span className="mt-0.5 shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px]
          text-muted">
          auto
        </span>
      )}
    </div>
  );
}

type GroupProps = { group: ToolGroup; open: boolean; onToggle: () => void; query: string };

function Group({ group, open, onToggle, query }: GroupProps) {
  const visible = query ? group.tools.filter((t) => matches(t, query)) : group.tools;
  if (query && visible.length === 0) return null;
  const expanded = open || query !== "";
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition
          hover:bg-surface-2"
      >
        <Chevron open={expanded} />
        <span className="flex-1 truncate text-sm font-medium">
          {group.label}
          {group.source !== BUILTIN ? (
            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]
              uppercase tracking-wide text-muted">
              MCP
            </span>
          ) : null}
        </span>
        {group.unreachable ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium
            text-danger">
            unreachable
          </span>
        ) : (
          <ApprovalBadge count={group.approvalCount} />
        )}
        <span className="w-16 text-right text-xs tabular-nums text-muted">
          {query ? `${visible.length}/${group.tools.length}` : group.tools.length}
          {" "}tools
        </span>
      </button>
      {expanded ? (
        <div className="divide-y divide-line border-t border-line bg-background/40">
          {visible.map((t) => <ToolRow key={t.name} tool={t} />)}
        </div>
      ) : null}
    </div>
  );
}

// Collapsed by default: this list runs to 100+ entries once an MCP server is
// connected, and it is reference material rather than something to act on.
export function AgentToolsSection() {
  const fetchTools = useCallback((signal: AbortSignal) => listAgentTools(signal), []);
  const { state } = usePoll(fetchTools, 30000);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () => (state.kind === "ready" ? groupBySource(state.data) : []),
    [state],
  );
  const total = state.kind === "ready" ? state.data.length : 0;
  const approvals = state.kind === "ready"
    ? state.data.filter((t) => t.requires_approval).length
    : 0;

  const toggleGroup = (source: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-3 mt-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Agent tools</h2>
          <p className="text-[13px] text-muted">
            {state.kind === "ready"
              ? `${total} tools across ${groups.length} ${groups.length === 1 ? "source" : "sources"}` +
                (approvals ? ` · ${approvals} require approval` : "")
              : "What the agent can call right now."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium
            transition hover:bg-surface-2"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {!open ? null : state.kind === "loading" ? (
        <Skeleton rows={4} />
      ) : state.kind === "error" ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>
      ) : (
        <Card>
          <div className="border-b border-line px-5 py-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tools by name or description…"
              className="w-full rounded-lg border border-line bg-background px-3 py-1.5
                text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          {groups.map((g) => (
            <Group
              key={g.source}
              group={g}
              open={openGroups.has(g.source)}
              onToggle={() => toggleGroup(g.source)}
              query={query.trim()}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

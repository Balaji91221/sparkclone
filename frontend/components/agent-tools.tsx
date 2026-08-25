"use client";

import { useCallback, useMemo, useState } from "react";
import { listAgentTools } from "@/lib/api";
import type { AgentTool } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Card, Skeleton } from "./ui";

const BUILTIN = "builtin";

const Mode = { All: "all", Auto: "auto", Approval: "approval" } as const;
type Mode = (typeof Mode)[keyof typeof Mode];

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
  return groups.sort((a, b) => {
    if (a.source === BUILTIN) return -1;
    if (b.source === BUILTIN) return 1;
    return a.label.localeCompare(b.label);
  });
}

function matches(tool: AgentTool, query: string, mode: Mode): boolean {
  if (mode === Mode.Auto && tool.requires_approval) return false;
  if (mode === Mode.Approval && !tool.requires_approval) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  return displayName(tool).toLowerCase().includes(q) || tool.description.toLowerCase().includes(q);
}

/* ---------------------------------------------------------------- atoms */

function Icon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  chevron: "M9 6l6 6-6 6",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0V8zM12 18v4",
};

type Tone = "auto" | "approval" | "danger";

const TONE: Record<Tone, { chip: string; dot: string }> = {
  auto: { chip: "bg-ok-soft text-ok", dot: "bg-ok" },
  approval: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  danger: { chip: "bg-danger-soft text-danger", dot: "bg-danger" },
};

function StatusChip({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5
      text-[11px] font-medium ${TONE[tone].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- rows */

function ToolRow({ tool }: { tool: AgentTool }) {
  return (
    <li className="grid grid-cols-[minmax(0,15rem)_1fr_auto] items-start gap-x-5 gap-y-1
      px-5 py-3 transition hover:bg-surface-2/60 max-md:grid-cols-[1fr_auto]">
      <code className="w-fit max-w-full truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-[12px]
        font-medium" title={tool.name}>
        {displayName(tool)}
      </code>
      <p className="line-clamp-2 self-center text-[13px] leading-relaxed text-muted
        max-md:order-last max-md:col-span-2">
        {tool.description}
      </p>
      <div className="self-center">
        {tool.requires_approval
          ? <StatusChip tone="approval">Approval</StatusChip>
          : <StatusChip tone="auto">Auto</StatusChip>}
      </div>
    </li>
  );
}

type GroupProps = { group: ToolGroup; open: boolean; onToggle: () => void; query: string; mode: Mode };

function Group({ group, open, onToggle, query, mode }: GroupProps) {
  const filtering = query !== "" || mode !== Mode.All;
  const visible = filtering ? group.tools.filter((t) => matches(t, query, mode)) : group.tools;
  if (filtering && visible.length === 0) return null;
  const expanded = open || filtering;
  const isBuiltin = group.source === BUILTIN;
  const autoCount = group.tools.length - group.approvalCount;

  return (
    <section className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition
          hover:bg-surface-2/60"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg
          ${isBuiltin ? "bg-tint-blue text-accent" : "bg-tint-violet text-foreground"}`}>
          <Icon path={isBuiltin ? ICONS.spark : ICONS.plug} className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{group.label}</span>
            {!isBuiltin ? (
              <span className="rounded-full border border-line px-1.5 py-px font-mono
                text-[10px] uppercase tracking-wide text-muted">
                mcp
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted">
            {isBuiltin ? "Ships with Astra" : "Connected MCP server"}
            {" · "}
            {filtering ? `${visible.length} of ${group.tools.length} shown` : `${group.tools.length} tools`}
          </span>
        </span>
        <span className="hidden items-center gap-4 sm:flex">
          {group.unreachable ? (
            <StatusChip tone="danger">Unreachable</StatusChip>
          ) : (
            <>
              <Stat value={autoCount} label="auto" />
              <Stat value={group.approvalCount} label="approval" />
            </>
          )}
        </span>
        <Icon
          path={ICONS.chevron}
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded ? (
        <ul className="divide-y divide-line border-t border-line bg-background/50">
          {visible.map((t) => <ToolRow key={t.name} tool={t} />)}
        </ul>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- toolbar */

const MODES: Array<{ value: Mode; label: string }> = [
  { value: Mode.All, label: "All" },
  { value: Mode.Auto, label: "Auto" },
  { value: Mode.Approval, label: "Approval" },
];

type ToolbarProps = {
  query: string;
  onQuery: (q: string) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
};

function Toolbar({ query, onQuery, mode, onMode }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
      <label className="relative min-w-[14rem] flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center
          text-muted">
          <Icon path={ICONS.search} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className="w-full rounded-full border border-line bg-background py-1.5 pl-9 pr-3
            text-sm outline-none transition placeholder:text-muted focus:border-accent
            focus:ring-2 focus:ring-accent-soft"
        />
      </label>
      <div role="radiogroup" aria-label="Filter by approval"
        className="flex rounded-full border border-line bg-background p-0.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => onMode(m.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              mode === m.value
                ? "bg-surface text-foreground shadow-[var(--shadow-card)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- section */

// Collapsed by default: this list runs to 100+ entries once an MCP server is
// connected, and it is reference material rather than something to act on.
export function AgentToolsSection() {
  const fetchTools = useCallback((signal: AbortSignal) => listAgentTools(signal), []);
  const { state } = usePoll(fetchTools, 30000);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>(Mode.All);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const tools = useMemo(() => (state.kind === "ready" ? state.data : []), [state]);
  const groups = useMemo(() => groupBySource(tools), [tools]);
  const approvals = tools.filter((t) => t.requires_approval).length;
  const trimmed = query.trim();
  const anyVisible = groups.some((g) => g.tools.some((t) => matches(t, trimmed, mode)));

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
      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[15px] font-semibold">Agent tools</h2>
          <p className="text-[13px] text-muted">
            Everything the agent can call right now, grouped by where it comes from.
          </p>
        </div>
        <div className="flex items-center gap-5">
          {state.kind === "ready" ? (
            <div className="hidden items-center gap-4 sm:flex">
              <Stat value={tools.length} label="tools" />
              <Stat value={groups.length} label={groups.length === 1 ? "source" : "sources"} />
              <Stat value={approvals} label="need approval" />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-full border border-line
              bg-surface px-3.5 py-1.5 text-xs font-medium transition hover:bg-surface-2"
          >
            {open ? "Hide" : "Show"}
            <Icon
              path={ICONS.chevron}
              className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
            />
          </button>
        </div>
      </div>

      {!open ? null : state.kind === "loading" ? (
        <Skeleton rows={4} />
      ) : state.kind === "error" ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>
      ) : (
        <Card>
          <Toolbar query={query} onQuery={setQuery} mode={mode} onMode={setMode} />
          {anyVisible ? (
            groups.map((g) => (
              <Group
                key={g.source}
                group={g}
                open={openGroups.has(g.source)}
                onToggle={() => toggleGroup(g.source)}
                query={trimmed}
                mode={mode}
              />
            ))
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No tools match {trimmed ? <>&ldquo;{trimmed}&rdquo;</> : "this filter"}.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

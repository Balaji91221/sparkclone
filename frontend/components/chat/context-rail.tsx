"use client";

import Link from "next/link";
import { toSteps } from "@/lib/transcript-steps";
import type { ChatStatus } from "./conversation";
import { toolLook } from "../activity/tool-looks";
import { Icon } from "../icons";

type ContextRailProps = { transcript: unknown[]; status: ChatStatus };

// MCP tools arrive as `mcp_<server>_<server>_<group>__<tool>`; the part after
// the last "__" (or after "mcp_") is the readable tool name.
function toolTitle(name: string): string | null {
  if (!name.startsWith("mcp_")) return null;
  const idx = name.lastIndexOf("__");
  return idx === -1 ? name.slice(4) : name.slice(idx + 2);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

// Activity panel on wide screens. Only rendered once Astra has actually done
// something in this conversation — an empty rail reads as an unfinished page.
export function ContextRail({ transcript, status }: ContextRailProps) {
  const tools = toSteps(transcript).filter((s) => s.kind === "tool");
  if (tools.length === 0 && status !== "thinking") return null;
  const recent = tools.slice(-8).reverse();

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-7 overflow-y-auto border-l border-line
      bg-background/40 px-3 py-5 xl:flex">
      <Section title="Activity">
        {tools.length === 0 ? (
          <p className="px-2 text-[13px] text-muted">Astra is thinking…</p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((t) => {
              const look = toolLook(t.name);
              const title = toolTitle(t.name);
              const running = t.result === null && status === "thinking";
              return (
                <li key={t.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full
                    ${look.className} ${running ? "pulse-soft" : ""}`}>
                    <Icon name={look.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{title ?? look.label}</span>
                    {title ? (
                      <span className="block truncate text-[11px] text-muted">{look.label}</span>
                    ) : null}
                  </span>
                  {running ? (
                    <span className="ml-auto text-xs text-accent">running</span>
                  ) : (
                    <Icon name="check" className="ml-auto h-3.5 w-3.5 shrink-0 text-ok" />
                  )}
                </li>
              );
            })}
            {tools.length > recent.length ? (
              <li className="px-2 pt-1 text-xs text-muted">+{tools.length - recent.length} earlier</li>
            ) : null}
          </ul>
        )}
      </Section>

      <Section title="Manage">
        <ul className="space-y-0.5 text-[13px]">
          <li>
            <Link href="/apps" className="block rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
              Connected apps
            </Link>
          </li>
          <li>
            <Link href="/skills" className="block rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
              Skills
            </Link>
          </li>
          <li>
            <Link href="/settings#tools" className="block rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
              Agent tools
            </Link>
          </li>
        </ul>
      </Section>
    </aside>
  );
}

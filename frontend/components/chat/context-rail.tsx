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
      <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

// Right-hand rail (xl screens): what Astra has done in this conversation and
// where to manage what it can do. Mirrors the "Progress / Skills & apps"
// panel pattern so the thread itself stays clean.
export function ContextRail({ transcript, status }: ContextRailProps) {
  const tools = toSteps(transcript).filter((s) => s.kind === "tool");
  const recent = tools.slice(-6).reverse();

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-7 pt-1 xl:flex">
      <Section title="Progress">
        {tools.length === 0 ? (
          <p className="px-2 text-[13px] text-muted">
            {status === "thinking" ? "Astra is thinking…" : "No actions taken yet."}
          </p>
        ) : (
          <ul className="space-y-1">
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
              <li className="px-2 pt-1 text-xs text-muted">
                +{tools.length - recent.length} earlier
              </li>
            ) : null}
          </ul>
        )}
      </Section>

      <Section title="Skills & apps">
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
            <Link href="/settings" className="block rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
              Agent tools
            </Link>
          </li>
        </ul>
      </Section>
    </aside>
  );
}

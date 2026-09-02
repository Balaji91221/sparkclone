"use client";

// Gemini-Spark-style app gallery: pick an app, customise the instructions
// (optionally attaching skills), set a schedule, and Astra creates a task
// scoped to that app's tools.

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { ScheduleField } from "@/components/schedule-field";
import type { TriggerValue } from "@/components/schedule-field";
import { Button, ErrorBanner, Modal, PageHeader, Skeleton, inputClass } from "@/components/ui";
import { createTask, listConnectors, listMcpServers, listSkills } from "@/lib/api";
import type { ConnectorInfo, MCPServerInfo } from "@/lib/api";
import type { SkillDef } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

type AppDef = {
  key: string;
  name: string;
  icon: string;
  desc: string;
  tools: string[];
  template: string;
};

// notify is included everywhere so every app can deliver its result.
const BUILTIN_APPS: AppDef[] = [
  {
    key: "gmail",
    name: "Gmail",
    icon: "mail",
    desc: "Read, summarize, and send email on your schedule.",
    tools: ["read_gmail", "send_gmail", "notify"],
    template:
      "Read my inbox from the last 24 hours. Summarize what matters, grouped by " +
      "importance, and email me the digest.",
  },
  {
    key: "drive",
    name: "Google Drive",
    icon: "folder",
    desc: "Watch folders, read docs, and report on changes.",
    tools: ["list_drive_files", "read_drive_file", "notify"],
    template:
      "List the files in my Drive that changed in the last week and send me a " +
      "short summary of each.",
  },
  {
    key: "youtube",
    name: "YouTube",
    icon: "play",
    desc: "Follow channels, pull transcripts, and digest new videos.",
    tools: [
      "youtube_channel_feed", "youtube_transcript", "youtube_video_info", "notify",
    ],
    template:
      "Check this channel for new videos: <channel URL>. For each new video, get " +
      "the transcript, summarize the key points, and email me the digest.",
  },
  {
    key: "web",
    name: "Web research",
    icon: "globe",
    desc: "Fetch pages, track topics, and build cited digests.",
    tools: ["web_fetch", "notify"],
    template:
      "Research the topic <topic> from reliable sources, then send me a concise " +
      "briefing with links to every source you used.",
  },
  {
    key: "python",
    name: "Python",
    icon: "code",
    desc: "Run analysis or data jobs and deliver the results.",
    tools: ["run_python", "notify"],
    template:
      "Run a Python analysis that <describe the computation>, then email me the " +
      "result.",
  },
];

const connectorApp = (c: ConnectorInfo): AppDef => ({
  key: `connector-${c.kind}`,
  name: c.name,
  icon: c.icon,
  desc: c.description,
  tools: [...c.tools.map((t) => t.name), "notify"],
  template:
    `Use the ${c.name} tools to <describe what to do>, then send me the result.`,
});

const mcpApp = (s: MCPServerInfo): AppDef => ({
  key: `mcp-${s.name}`,
  name: s.name,
  icon: "plug",
  desc: `Custom app via MCP (${s.transport}) — all of its tools.`,
  tools: [`mcp_${s.name}_*`, "notify"],
  template:
    `Use the ${s.name} tools to <describe what to do>, then send me the result.`,
});

export default function AppsPage() {
  const fetchAll = useCallback(async (signal: AbortSignal) => {
    const [skills, servers, connectors] = await Promise.all([
      listSkills(signal),
      listMcpServers(signal).catch(() => []),
      listConnectors(signal).catch(() => []),
    ]);
    return { skills, servers, connectors };
  }, []);
  const { state } = usePoll(fetchAll, 15000);
  const data = state.kind === "ready" ? state.data : null;
  const [active, setActive] = useState<AppDef | null>(null);

  // Built-ins keep their order and exact names; connected services follow.
  const apps = [
    ...BUILTIN_APPS,
    ...(data?.connectors.filter((c) => c.connected && c.enabled && c.tools.length > 0)
      .map(connectorApp) ?? []),
    ...(data?.servers.filter((s) => s.enabled).map(mcpApp) ?? []),
  ];

  return (
    <div>
      <PageHeader
        title="Apps"
        lede="Pick an app, customise what Astra should do, and set a schedule — each
          automation stays scoped to that app's tools."
      />
      {state.kind === "error" ? <ErrorBanner message={state.message} /> : null}
      {state.kind === "loading" ? <Skeleton rows={3} /> : null}

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, i) => (
            <button
              key={app.key}
              type="button"
              onClick={() => setActive(app)}
              className="anim-rise hover-lift rounded-2xl border border-line bg-surface
                p-5 text-left shadow-[var(--shadow-card)] hover:border-accent/40"
              style={{ "--d": `${Math.min(i, 8) * 60}ms` } as React.CSSProperties}
            >
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-full
                bg-accent-soft text-accent">
                <Icon name={app.icon} className="h-5 w-5" />
              </span>
              <p className="text-[15px] font-semibold">{app.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{app.desc}</p>
              <p className="mt-3 text-xs font-medium text-accent">Create automation →</p>
            </button>
          ))}
        </div>
      ) : null}

      {data && data.connectors.filter((c) => c.connected && c.enabled).length === 0 ? (
        <p className="mt-6 text-[13px] text-muted">
          Connect Slack, Telegram, Mail or Discord on the Connectors page to add more apps
          here — or add an MCP server in Settings.
        </p>
      ) : null}

      {active ? (
        <AppAutomationDialog
          app={active}
          skills={data?.skills ?? []}
          onClose={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

type DialogProps = { app: AppDef; skills: SkillDef[]; onClose: () => void };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

function AppAutomationDialog({ app, skills, onClose }: DialogProps) {
  const router = useRouter();
  const [name, setName] = useState(`${app.name} automation`);
  const [prompt, setPrompt] = useState(app.template);
  const [trigger, setTrigger] = useState<TriggerValue>(
    { trigger_type: "manual", trigger_value: "" });
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  const toggleSkill = (id: string) =>
    setSkillIds((ids) =>
      ids.includes(id) ? ids.filter((s) => s !== id) : [...ids, id]);

  const submit = async () => {
    if (!prompt.trim()) {
      setSave({ kind: "error", message: "Describe what Astra should do." });
      return;
    }
    setSave({ kind: "saving" });
    try {
      await createTask({
        name: name.trim() || `${app.name} automation`,
        prompt: prompt.trim(),
        skill_ids: skillIds,
        allowed_tools: app.tools,
        ...trigger,
        max_retries: 0,
        enabled: true,
      });
      router.push("/tasks");
    } catch (e: unknown) {
      setSave({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Modal open title={`New ${app.name} automation`} onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <label htmlFor="app-name" className="mb-1.5 block text-[13px] font-medium text-muted">
          Name
        </label>
        <input
          id="app-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />

        <label htmlFor="app-prompt"
          className="mb-1.5 mt-4 block text-[13px] font-medium text-muted">
          What should Astra do?
        </label>
        <textarea
          id="app-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={`${inputClass} min-h-[120px] resize-y leading-relaxed`}
        />

        <p className="mb-1.5 mt-4 text-[13px] font-medium text-muted">When to run</p>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <ScheduleField value={trigger} onChange={setTrigger} />
        </div>

        {skills.length > 0 ? (
          <>
            <p className="mb-1.5 mt-4 text-[13px] font-medium text-muted">
              Attach skills
            </p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => {
                const on = skillIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs font-medium
                      transition ${
                        on
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-surface text-muted hover:text-foreground"
                      }`}
                  >
                    {on ? "✓ " : ""}{s.name}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Scoped to: {app.tools.join(", ")}
        </p>

        {save.kind === "error" ? (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm
            text-danger">
            {save.message}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void submit()}
          disabled={save.kind === "saving"}>
          {save.kind === "saving" ? "Creating…" : "Create automation"}
        </Button>
      </div>
    </Modal>
  );
}

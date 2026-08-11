// Shapes returned by the FastAPI backend (app/main.py). Data crossing the
// network boundary is unknown until narrowed by the parse* functions below.

export type Task = {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  skill_ids: string[];
  allowed_tools: string[];
  enabled: boolean;
};

export type SkillDef = {
  id: string;
  name: string;
  description: string;
  instructions: string;
};

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunSummary = {
  id: string;
  task_id: string;
  status: RunStatus;
  trigger: string;
  created_at: string;
  finished_at: string | null;
  output: string;
  error: string;
};

export type RunDetail = {
  id: string;
  task_id: string;
  status: RunStatus;
  output: string;
  error: string;
  // Agent message history — a JSON list whose exact block shapes belong to the
  // LLM provider; the transcript viewer narrows it further.
  transcript: unknown;
};

export type Approval = {
  id: string;
  run_id: string;
  tool_name: string;
  tool_input: unknown;
  created_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function runStatus(v: unknown): RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(str(v)) ? (v as RunStatus) : "queued";
}

export function parseTask(v: unknown): Task | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    name: str(v.name),
    prompt: str(v.prompt),
    cron: str(v.cron),
    skill_ids: strList(v.skill_ids),
    allowed_tools: strList(v.allowed_tools),
    enabled: v.enabled === true,
  };
}

export function parseSkill(v: unknown): SkillDef | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    name: str(v.name),
    description: str(v.description),
    instructions: str(v.instructions),
  };
}

export function parseRunSummary(v: unknown): RunSummary | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    task_id: str(v.task_id),
    status: runStatus(v.status),
    trigger: str(v.trigger),
    created_at: str(v.created_at),
    finished_at: typeof v.finished_at === "string" ? v.finished_at : null,
    output: str(v.output),
    error: str(v.error),
  };
}

export function parseRunDetail(v: unknown): RunDetail | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    task_id: str(v.task_id),
    status: runStatus(v.status),
    output: str(v.output),
    error: str(v.error),
    transcript: v.transcript,
  };
}

export function parseApproval(v: unknown): Approval | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    run_id: str(v.run_id),
    tool_name: str(v.tool_name),
    tool_input: v.tool_input,
    created_at: str(v.created_at),
  };
}

export function parseList<T>(v: unknown, one: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(one).filter((x): x is T => x !== null);
}

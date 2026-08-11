import {
  parseApproval,
  parseList,
  parseRunDetail,
  parseRunSummary,
  parseSkill,
  parseTask,
} from "./types";
import type { Approval, RunDetail, RunSummary, SkillDef, Task } from "./types";

const TOKEN_KEY = "spark_token";
const TOKEN_EVENT = "spark:token";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

// Subscription hook-up for useSyncExternalStore in the app shell.
export function subscribeToken(onChange: () => void): () => void {
  window.addEventListener(TOKEN_EVENT, onChange);
  return () => window.removeEventListener(TOKEN_EVENT, onChange);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  token?: string;
};

async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.token ?? getToken()}`,
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401) {
    // A stored token the backend rejects is stale — drop it so the shell
    // returns to the login screen. Candidate tokens (login flow) are spared.
    if (opts.token === undefined) clearToken();
    throw new ApiError(401, "Invalid or missing API token");
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

// Used by the login screen to validate a candidate token before storing it.
export async function verifyToken(token: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await request("/api/tasks", { token, signal });
    return true;
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 401) return false;
    throw e;
  }
}

export type TaskInput = {
  name: string;
  prompt: string;
  skill_ids: string[];
  allowed_tools: string[];
  cron: string;
  enabled: boolean;
};

export async function listTasks(signal?: AbortSignal): Promise<Task[]> {
  return parseList(await request("/api/tasks", { signal }), parseTask);
}

export async function createTask(body: TaskInput): Promise<void> {
  await request("/api/tasks", { method: "POST", body });
}

export async function updateTask(id: string, body: TaskInput): Promise<void> {
  await request(`/api/tasks/${id}`, { method: "PUT", body });
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/api/tasks/${id}`, { method: "DELETE" });
}

export async function runTask(id: string): Promise<void> {
  await request(`/api/tasks/${id}/run`, { method: "POST" });
}

export async function listSkills(signal?: AbortSignal): Promise<SkillDef[]> {
  return parseList(await request("/api/skills", { signal }), parseSkill);
}

export type SkillInput = { name: string; description: string; instructions: string };

export async function createSkill(body: SkillInput): Promise<void> {
  await request("/api/skills", { method: "POST", body });
}

export async function deleteSkill(id: string): Promise<void> {
  await request(`/api/skills/${id}`, { method: "DELETE" });
}

export async function listRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  return parseList(await request("/api/runs", { signal }), parseRunSummary);
}

export async function getRun(id: string, signal?: AbortSignal): Promise<RunDetail | null> {
  return parseRunDetail(await request(`/api/runs/${id}`, { signal }));
}

export async function listApprovals(signal?: AbortSignal): Promise<Approval[]> {
  return parseList(await request("/api/approvals", { signal }), parseApproval);
}

export async function decideApproval(id: string, decision: "approve" | "deny"): Promise<void> {
  await request(`/api/approvals/${id}/${decision}`, { method: "POST" });
}

export type GoogleStatus = { connected: boolean; email: string; scopes: string[] };

function parseGoogleStatus(v: unknown): GoogleStatus {
  if (typeof v !== "object" || v === null) return { connected: false, email: "", scopes: [] };
  const r = v as Record<string, unknown>;
  return {
    connected: r.connected === true,
    email: typeof r.email === "string" ? r.email : "",
    scopes: Array.isArray(r.scopes)
      ? r.scopes.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export async function googleStatus(signal?: AbortSignal): Promise<GoogleStatus> {
  return parseGoogleStatus(await request("/auth/google/status", { signal }));
}

export async function googleDisconnect(): Promise<void> {
  await request("/auth/google/disconnect", { method: "POST" });
}

export type MCPServerInfo = {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  url: string;
  enabled: boolean;
  requires_approval: boolean;
  has_env: boolean;
};

function parseMcpServer(v: unknown): MCPServerInfo | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    transport: r.transport === "http" ? "http" : "stdio",
    command: typeof r.command === "string" ? r.command : "",
    args: Array.isArray(r.args) ? r.args.filter((a): a is string => typeof a === "string") : [],
    url: typeof r.url === "string" ? r.url : "",
    enabled: r.enabled === true,
    requires_approval: r.requires_approval === true,
    has_env: r.has_env === true,
  };
}

export type MCPServerInput = {
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  requires_approval: boolean;
};

export async function listMcpServers(signal?: AbortSignal): Promise<MCPServerInfo[]> {
  return parseList(await request("/api/mcp", { signal }), parseMcpServer);
}

export async function addMcpServer(body: MCPServerInput): Promise<void> {
  await request("/api/mcp", { method: "POST", body });
}

export async function deleteMcpServer(id: string): Promise<void> {
  await request(`/api/mcp/${id}`, { method: "DELETE" });
}

export async function toggleMcpServer(id: string): Promise<void> {
  await request(`/api/mcp/${id}/toggle`, { method: "POST" });
}

export async function toggleMcpApproval(id: string): Promise<void> {
  await request(`/api/mcp/${id}/approval`, { method: "POST" });
}

export type AgentTool = {
  name: string;
  description: string;
  requires_approval: boolean;
  source: string;
};

function parseAgentTool(v: unknown): AgentTool | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.name !== "string") return null;
  return {
    name: r.name,
    description: typeof r.description === "string" ? r.description : "",
    requires_approval: r.requires_approval === true,
    source: typeof r.source === "string" ? r.source : "builtin",
  };
}

export async function listAgentTools(signal?: AbortSignal): Promise<AgentTool[]> {
  return parseList(await request("/api/tools", { signal }), parseAgentTool);
}

import {
  parseApproval,
  parseList,
  parseRunDetail,
  parseRunSummary,
  parseSkill,
  parseTask,
} from "./types";
import type { Approval, RunDetail, RunSummary, SkillDef, Task, TriggerType } from "./types";

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

// Auth is either a bearer token (stored or candidate) or the HttpOnly session
// cookie set by Google sign-in, which the browser attaches on its own since
// /api and /auth are proxied through the dashboard origin.
async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const token = opts.token ?? getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    signal: opts.signal,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 401) {
    // Stored auth the backend rejects is stale — drop it and notify the shell
    // so it re-checks the session. Candidate tokens (login flow) are spared.
    if (opts.token === undefined) clearToken();
    throw new ApiError(401, "Invalid or missing API token");
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export type Session = { signedIn: boolean; email: string; googleEnabled: boolean };

function parseSession(v: unknown): Session {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return {
    signedIn: o.signed_in === true,
    email: typeof o.email === "string" ? o.email : "",
    googleEnabled: o.google_enabled === true,
  };
}

// Public endpoint: who the current cookie session belongs to, if anyone.
export async function getSession(signal?: AbortSignal): Promise<Session> {
  const res = await fetch("/auth/google/session", { signal });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return parseSession(await res.json());
}

// Ends the cookie session and forgets any stored token. clearToken() fires
// the token event either way, which makes the shell re-check the session.
export async function logout(): Promise<void> {
  try {
    await fetch("/auth/google/logout", { method: "POST" });
  } finally {
    clearToken();
  }
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
  trigger_type: TriggerType;
  trigger_value: string;
  max_retries: number;
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

// Returns the new webhook path; the old URL stops working immediately.
export async function rotateWebhookSecret(id: string): Promise<string> {
  const res = await request(`/api/tasks/${id}/webhook-secret`, { method: "POST" });
  const url = (res as Record<string, unknown> | null)?.webhook_url;
  if (typeof url !== "string") throw new ApiError(500, "unexpected rotate response");
  return url;
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

export type NotificationSettings = {
  notify_on_final_failure: boolean;
  notify_on_pending_approval: boolean;
  notify_on_chat_approval: boolean;
  failure_cooldown_minutes: number;
  delivery: "email" | "stdout";
};

function parseNotificationSettings(v: unknown): NotificationSettings {
  const r = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    notify_on_final_failure: r.notify_on_final_failure !== false,
    notify_on_pending_approval: r.notify_on_pending_approval !== false,
    notify_on_chat_approval: r.notify_on_chat_approval === true,
    failure_cooldown_minutes:
      typeof r.failure_cooldown_minutes === "number" ? r.failure_cooldown_minutes : 60,
    delivery: r.delivery === "email" ? "email" : "stdout",
  };
}

export async function getNotificationSettings(
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  return parseNotificationSettings(await request("/api/settings/notifications", { signal }));
}

export async function updateNotificationSettings(
  body: Omit<NotificationSettings, "delivery">,
): Promise<NotificationSettings> {
  return parseNotificationSettings(
    await request("/api/settings/notifications", { method: "PUT", body }),
  );
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

export type MCPTransport = "stdio" | "http" | "sse";

export type MCPServerInfo = {
  id: string;
  name: string;
  transport: MCPTransport;
  command: string;
  args: string[];
  url: string;
  enabled: boolean;
  requires_approval: boolean;
  has_env: boolean;
};

function parseTransport(v: unknown): MCPTransport {
  return v === "http" || v === "sse" ? v : "stdio";
}

function parseMcpServer(v: unknown): MCPServerInfo | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    transport: parseTransport(r.transport),
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
  transport: MCPTransport;
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

export type ChatSummary = { id: string; title: string; status: string; updated_at: string };

function parseChatSummary(v: unknown): ChatSummary | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : "Chat",
    status: typeof r.status === "string" ? r.status : "idle",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

export type ChatDetail = ChatSummary & { messages: unknown[] };

export async function createChat(): Promise<string> {
  const res = await request("/api/chats", { method: "POST" });
  const id = (res as Record<string, unknown> | null)?.id;
  if (typeof id !== "string") throw new ApiError(500, "unexpected create-chat response");
  return id;
}

export async function listChats(signal?: AbortSignal): Promise<ChatSummary[]> {
  return parseList(await request("/api/chats", { signal }), parseChatSummary);
}

export async function getChat(id: string, signal?: AbortSignal): Promise<ChatDetail | null> {
  const res = await request(`/api/chats/${id}`, { signal });
  const base = parseChatSummary(res);
  if (!base) return null;
  const messages = (res as Record<string, unknown>).messages;
  return { ...base, updated_at: base.updated_at, messages: Array.isArray(messages) ? messages : [] };
}

export async function sendChatMessage(id: string, content: string): Promise<void> {
  await request(`/api/chats/${id}/messages`, { method: "POST", body: { content } });
}

export async function deleteChat(id: string): Promise<void> {
  await request(`/api/chats/${id}`, { method: "DELETE" });
}

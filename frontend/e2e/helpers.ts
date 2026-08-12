import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

export const API = "http://localhost:8010";
export const PREFIX = "E2E-PW";

let cachedToken = "";

export function apiToken(): string {
  if (cachedToken) return cachedToken;
  const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("SPARK_API_TOKEN="));
  if (!line) throw new Error("SPARK_API_TOKEN not found in ../.env");
  cachedToken = line.slice("SPARK_API_TOKEN=".length).trim();
  return cachedToken;
}

export async function api(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${apiToken()}` },
  });
}

/** Signs the page in by storing the token before the app boots. */
export async function login(page: Page): Promise<void> {
  await page.addInitScript(
    (token: string) => window.localStorage.setItem("spark_token", token),
    apiToken(),
  );
}

export type TaskSeed = {
  name: string;
  prompt?: string;
  cron?: string;
  enabled?: boolean;
  allowed_tools?: string[];
  skill_ids?: string[];
};

export async function createTask(ctx: APIRequestContext, seed: TaskSeed): Promise<string> {
  const res = await ctx.post("/api/tasks", {
    data: {
      name: seed.name,
      prompt: seed.prompt ?? "Reply with exactly the word ok. Do not use any tools.",
      skill_ids: seed.skill_ids ?? [],
      allowed_tools: seed.allowed_tools ?? [],
      cron: seed.cron ?? "",
      enabled: seed.enabled ?? true,
    },
  });
  if (!res.ok()) throw new Error(`createTask failed: ${res.status()}`);
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error("createTask: no id in response");
  return body.id;
}

export async function listTasks(
  ctx: APIRequestContext,
): Promise<Array<Record<string, unknown>>> {
  const res = await ctx.get("/api/tasks");
  return (await res.json()) as Array<Record<string, unknown>>;
}

/** Deletes every task whose name carries the E2E prefix. */
export async function cleanupTasks(ctx: APIRequestContext): Promise<void> {
  for (const t of await listTasks(ctx)) {
    if (String(t.name).includes(PREFIX)) {
      await ctx.delete(`/api/tasks/${String(t.id)}`);
    }
  }
}

export async function runsForTask(
  ctx: APIRequestContext,
  taskId: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await ctx.get("/api/runs");
  const runs = (await res.json()) as Array<Record<string, unknown>>;
  return runs.filter((r) => r.task_id === taskId);
}

/** Polls until the task has a run in one of the wanted states. */
export async function waitForRun(
  ctx: APIRequestContext,
  taskId: string,
  states: string[],
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const runs = await runsForTask(ctx, taskId);
    const hit = runs.find((r) => states.includes(String(r.status)));
    if (hit) return hit;
    if (Date.now() > deadline) {
      const seen = runs.map((r) => r.status).join(", ") || "none";
      throw new Error(`no run in [${states.join("|")}] for ${taskId}; saw: ${seen}`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import {
  PREFIX, api, cleanupTasks, createTask, login, waitForRun,
} from "./helpers";

// Real execution: these tests exercise the actual agent loop (LLM calls)
// and the APScheduler cron trigger, so they are the slow tail of the suite.

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await api();
  await cleanupTasks(ctx);
});

test.afterAll(async () => {
  await cleanupTasks(ctx);
});

test.describe("run execution", () => {
  test("a triggered run executes to success and shows its transcript", async ({ page }) => {
    const id = await createTask(ctx, {
      name: `${PREFIX} exec ok`,
      prompt: "Reply with exactly the word ok. Do not use any tools.",
    });
    const res = await ctx.post(`/api/tasks/${id}/run`);
    expect(res.ok()).toBe(true);

    const run = await waitForRun(ctx, id, ["succeeded", "failed"], 110_000);
    expect(run.status).toBe("succeeded");

    await login(page);
    await page.goto(`/runs/${String(run.id)}`);
    await expect(page.getByText("succeeded").first()).toBeVisible();
  });

  test("a task scoped to no-tools cannot call tools it lacks", async ({ page }) => {
    // Scoped to notify only; the prompt asks for a plain reply, so the run
    // must still succeed without any other tool being available.
    const id = await createTask(ctx, {
      name: `${PREFIX} scoped exec`,
      prompt: "Reply with exactly the word ok. Do not use any tools.",
      allowed_tools: ["notify"],
    });
    await ctx.post(`/api/tasks/${id}/run`);
    const run = await waitForRun(ctx, id, ["succeeded", "failed"], 110_000);
    expect(run.status).toBe("succeeded");
    await login(page);
    await page.goto(`/runs/${String(run.id)}`);
    await expect(page.getByText("succeeded").first()).toBeVisible();
  });

  test("cron schedule auto-fires without manual trigger", async () => {
    // Schedule for the next whole minute (+65s safety) and wait for
    // APScheduler to fire it on its own.
    const at = new Date(Date.now() + 65_000);
    const cron = `${at.getMinutes()} ${at.getHours()} * * *`;
    const id = await createTask(ctx, {
      name: `${PREFIX} cron autofire`,
      prompt: "Reply with exactly the word ok. Do not use any tools.",
      cron,
    });
    const run = await waitForRun(
      ctx, id, ["queued", "running", "succeeded", "failed"], 150_000);
    expect(run.trigger).toBe("schedule");
  });

  test("a paused schedule does not auto-fire", async () => {
    test.setTimeout(200_000);
    const at = new Date(Date.now() + 65_000);
    const cron = `${at.getMinutes()} ${at.getHours()} * * *`;
    const id = await createTask(ctx, {
      name: `${PREFIX} paused no-fire`,
      cron,
      enabled: false,
    });
    // Give it well past the scheduled minute, then assert nothing ran.
    await new Promise((r) => setTimeout(r, 130_000));
    const res = await ctx.get("/api/runs");
    const runs = (await res.json()) as Array<Record<string, unknown>>;
    expect(runs.filter((r) => r.task_id === id)).toHaveLength(0);
  });
});

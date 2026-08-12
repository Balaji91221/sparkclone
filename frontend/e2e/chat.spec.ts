import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { PREFIX, api, cleanupTasks, listTasks, login } from "./helpers";

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await api();
  await cleanupTasks(ctx);
});

test.afterAll(async () => {
  await cleanupTasks(ctx);
});

test.describe("chat-driven scheduling", () => {
  test("Astra creates a schedule from a chat message", async ({ page }) => {
    const name = `${PREFIX} chat digest`;
    const created = await ctx.post("/api/chats");
    const chatId = ((await created.json()) as { id: string }).id;

    const send = await ctx.post(`/api/chats/${chatId}/messages`, {
      data: {
        content:
          `Create a task named "${name}" that runs daily at 7:00 AM and replies ` +
          "with a one-line hello. Create it right away without asking questions.",
      },
    });
    expect(send.ok()).toBe(true);

    // The chat agent thinks, calls create_task, and confirms — poll the API.
    await expect
      .poll(async () => (await listTasks(ctx)).some((t) => t.name === name),
        { timeout: 110_000, intervals: [3_000] })
      .toBe(true);

    const task = (await listTasks(ctx)).find((t) => t.name === name);
    expect(task?.cron).toBe("0 7 * * *");

    // The new schedule shows up in the UI with human phrasing.
    await login(page);
    await page.goto("/tasks");
    await expect(
      page.locator("div", { hasText: name }).filter({ hasText: "Daily around 7:00 AM" }).first(),
    ).toBeVisible();

    await ctx.delete(`/api/chats/${chatId}`);
  });
});

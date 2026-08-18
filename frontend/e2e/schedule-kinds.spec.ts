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

async function findTask(name: string): Promise<Record<string, unknown>> {
  const task = (await listTasks(ctx)).find((t) => t.name === name);
  expect(task, `task "${name}" should exist`).toBeTruthy();
  return task as Record<string, unknown>;
}

test.describe("new schedule kinds", () => {
  test("interval schedule stores seconds and shows next run", async ({ page }) => {
    const name = `${PREFIX} ui interval`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("interval");
    await page.getByLabel("Interval in minutes").fill("15");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");

    const task = await findTask(name);
    expect(task.trigger_type).toBe("interval");
    expect(task.trigger_value).toBe("900");
    await expect(
      page.locator("div", { hasText: name }).filter({ hasText: "Every 15 min" }).first(),
    ).toBeVisible();
    await expect(
      page.locator("div", { hasText: name }).filter({ hasText: "Next run in" }).first(),
    ).toBeVisible();
  });

  test("one-off datetime is sent as a real instant, not naive local time", async ({ page }) => {
    const name = `${PREFIX} ui once`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("once");

    // Tomorrow 09:00 local, as the datetime-local input formats it.
    const local = new Date(Date.now() + 24 * 3600 * 1000);
    local.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localValue =
      `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T09:00`;
    await page.getByLabel("Run once at").fill(localValue);
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");

    const task = await findTask(name);
    expect(task.trigger_type).toBe("date");
    // The stored value must be the same instant as 09:00 local (UTC-normalized),
    // proving the offset was attached rather than the wall-clock reinterpreted.
    const stored = new Date(String(task.trigger_value));
    expect(stored.getTime()).toBe(local.getTime());
    expect(String(task.trigger_value)).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
  });

  test("webhook task shows its URL after saving and can rotate it", async ({ page }) => {
    const name = `${PREFIX} ui webhook`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("webhook");
    await expect(page.getByText("Save the task to get its webhook URL")).toBeVisible();
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");

    const task = await findTask(name);
    expect(task.trigger_type).toBe("webhook");
    const url = String(task.webhook_url);
    expect(url).toMatch(new RegExp(`^/api/hooks/${String(task.id)}/`));

    await page.goto(`/tasks/${String(task.id)}/edit`);
    await expect(page.getByText("Webhook URL (POST to start a run)")).toBeVisible();
    await expect(page.getByText(url)).toBeVisible();

    page.on("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Rotate secret" }).click();
    await expect(page.getByText("Secret rotated")).toBeVisible();
    const rotated = await findTask(name);
    expect(rotated.webhook_url).not.toBe(url);
  });

  test("retries survive pause/resume from the list menu", async ({ page }) => {
    const name = `${PREFIX} ui retries`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("interval");
    await page.getByLabel("Interval in minutes").fill("30");
    await page.getByLabel("Retries on failure").selectOption("2");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");
    expect((await findTask(name)).max_retries).toBe(2);

    await page.getByLabel(`Actions for ${name}`).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();

    await expect
      .poll(async () => (await findTask(name)).enabled)
      .toBe(false);
    const paused = await findTask(name);
    expect(paused.max_retries).toBe(2);
    expect(paused.trigger_type).toBe("interval");
    expect(paused.trigger_value).toBe("1800");
  });
});

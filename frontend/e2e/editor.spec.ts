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

test.describe("manual schedule editor", () => {
  test("creates a weekly schedule through the picker UI", async ({ page }) => {
    const name = `${PREFIX} ui weekly`;
    await login(page);
    await page.goto("/tasks/new");

    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill(
      "Reply with exactly the word ok. Do not use any tools.");

    await page.getByLabel("Schedule frequency").selectOption("weekly");
    // MON is preselected; add Friday and move the time to 18:30.
    await page.getByRole("button", { name: "Friday" }).click();
    await page.locator('input[type="time"]').fill("18:30");
    await expect(page.getByText("Cron: 30 18 * * MON,FRI")).toBeVisible();

    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");

    const task = (await listTasks(ctx)).find((t) => t.name === name);
    expect(task).toBeTruthy();
    expect(task?.trigger_type).toBe("cron");
    expect(task?.trigger_value).toBe("30 18 * * MON,FRI");
  });

  test("creates a daily schedule and renders it back", async ({ page }) => {
    const name = `${PREFIX} ui daily`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("daily");
    await page.locator('input[type="time"]').fill("06:15");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");
    await expect(
      page.locator("div", { hasText: name }).filter({ hasText: "Daily around 6:15 AM" }).first(),
    ).toBeVisible();
  });

  test("custom cron passes through unchanged", async ({ page }) => {
    const name = `${PREFIX} ui custom`;
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(name);
    await page.getByLabel("Task instructions").fill("Reply with exactly ok.");
    await page.getByLabel("Schedule frequency").selectOption("custom");
    await page.getByPlaceholder("30 8 * * MON,THU").fill("*/15 9-17 * * MON-FRI");
    await page.getByRole("button", { name: "Create task" }).click();
    await page.waitForURL("**/tasks");
    const task = (await listTasks(ctx)).find((t) => t.name === name);
    expect(task?.trigger_type).toBe("cron");
    expect(task?.trigger_value).toBe("*/15 9-17 * * MON-FRI");
  });

  test("rejects an empty prompt", async ({ page }) => {
    await login(page);
    await page.goto("/tasks/new");
    await page.getByLabel("Task name").fill(`${PREFIX} no prompt`);
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("Describe what the agent should do.")).toBeVisible();
  });
});

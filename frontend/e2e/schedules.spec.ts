import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import {
  PREFIX, api, cleanupTasks, createTask, listTasks, login, waitForRun,
} from "./helpers";

// Schedule phrasing: every cron shape a user can pick must render as a
// human sentence, never raw cron.
const CASES = [
  { name: `${PREFIX} manual`, cron: "", human: "Manual — run on demand" },
  { name: `${PREFIX} daily 9pm`, cron: "0 21 * * *", human: "Daily around 9:00 PM" },
  { name: `${PREFIX} daily 7am`, cron: "30 7 * * *", human: "Daily around 7:30 AM" },
  { name: `${PREFIX} weekdays`, cron: "0 20 * * MON-FRI", human: "Weekdays around 8:00 PM" },
  { name: `${PREFIX} weekly mon`, cron: "15 9 * * MON", human: "Weekly on Monday around 9:15 AM" },
  { name: `${PREFIX} weekends`, cron: "0 10 * * SAT,SUN", human: "Weekends around 10:00 AM" },
  { name: `${PREFIX} monthly`, cron: "0 8 5 * *", human: "Monthly on day 5 around 8:00 AM" },
  { name: `${PREFIX} midnight`, cron: "0 0 * * *", human: "Daily around 12:00 AM" },
  { name: `${PREFIX} noon`, cron: "0 12 * * *", human: "Daily around 12:00 PM" },
];

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await api();
  await cleanupTasks(ctx);
});

test.afterAll(async () => {
  await cleanupTasks(ctx);
});

test.describe("schedules list", () => {
  test("renders every cron shape as a human sentence", async ({ page }) => {
    for (const c of CASES) await createTask(ctx, { name: c.name, cron: c.cron });
    await login(page);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible();
    for (const c of CASES) {
      const row = page.locator("div", { hasText: c.name }).filter({ hasText: c.human });
      await expect(row.first(), `${c.name} → "${c.human}"`).toBeVisible();
    }
    // No raw cron leaks into the list.
    await expect(page.getByText("* * MON-FRI")).toHaveCount(0);
  });

  test("groups enabled and paused into Ongoing / Paused", async ({ page }) => {
    await createTask(ctx, { name: `${PREFIX} on`, cron: "0 9 * * *", enabled: true });
    await createTask(ctx, { name: `${PREFIX} off`, cron: "0 9 * * *", enabled: false });
    await login(page);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Ongoing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  });

  test("kebab menu pauses and resumes a schedule", async ({ page }) => {
    const name = `${PREFIX} pause-me`;
    const id = await createTask(ctx, { name, cron: "0 6 * * *", enabled: true });
    await login(page);
    await page.goto("/tasks");

    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(async () => {
      const t = (await listTasks(ctx)).find((x) => x.id === id);
      return t?.enabled;
    }).toBe(false);

    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect.poll(async () => {
      const t = (await listTasks(ctx)).find((x) => x.id === id);
      return t?.enabled;
    }).toBe(true);
  });

  test("kebab menu deletes a schedule after confirm", async ({ page }) => {
    const name = `${PREFIX} delete-me`;
    const id = await createTask(ctx, { name });
    await login(page);
    await page.goto("/tasks");
    page.on("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(async () =>
      (await listTasks(ctx)).some((t) => t.id === id)).toBe(false);
  });

  test("Run now from the kebab menu queues a real run", async ({ page }) => {
    const name = `${PREFIX} run-now`;
    const id = await createTask(ctx, { name });
    await login(page);
    await page.goto("/tasks");
    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Run now", exact: true }).click();
    const run = await waitForRun(ctx, id, ["queued", "running", "succeeded"], 20_000);
    expect(run.task_id).toBe(id);
  });

  test("clicking a row opens the editor", async ({ page }) => {
    const name = `${PREFIX} open-editor`;
    const id = await createTask(ctx, { name, cron: "0 9 * * *" });
    await login(page);
    await page.goto("/tasks");
    await page.getByText(name, { exact: true }).click();
    await page.waitForURL(`**/tasks/${id}/edit`);
    await expect(page.getByLabel("Task name")).toHaveValue(name);
  });

  test("shows Gemini-style create buttons", async ({ page }) => {
    await login(page);
    await page.goto("/tasks");
    await expect(page.getByRole("link", { name: "Create with Astra" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create manually" })).toBeVisible();
  });
});

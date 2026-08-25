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

test.describe("apps gallery", () => {
  test("shows the built-in apps and connected MCP servers", async ({ page }) => {
    await login(page);
    await page.goto("/apps");
    for (const name of ["Gmail", "Google Drive", "YouTube", "Web research", "Python"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    // The demo MCP server from settings appears as a custom app card.
    await expect(page.getByText("Custom app via MCP", { exact: false })).toBeVisible();
  });

  test("creates a Gmail automation scoped to Gmail tools", async ({ page }) => {
    const name = `${PREFIX} gmail app`;
    await login(page);
    await page.goto("/apps");
    await page.getByRole("button", { name: /Gmail/ }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("New Gmail automation")).toBeVisible();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Schedule frequency").selectOption("daily");
    await dialog.locator('input[type="time"]').fill("08:30");
    await expect(dialog.getByText("Scoped to: read_gmail, send_gmail, notify")).toBeVisible();
    await dialog.getByRole("button", { name: "Create automation" }).click();
    await page.waitForURL("**/tasks");

    const task = (await listTasks(ctx)).find((t) => t.name === name);
    expect(task?.trigger_type).toBe("cron");
    expect(task?.trigger_value).toBe("30 8 * * *");
    expect(task?.allowed_tools).toEqual(["read_gmail", "send_gmail", "notify"]);
  });

  test("creates an MCP app automation with a server-wide scope", async ({ page }) => {
    const name = `${PREFIX} mcp app`;
    await login(page);
    await page.goto("/apps");
    await page.getByText("Custom app via MCP", { exact: false }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create automation" }).click();
    await page.waitForURL("**/tasks");

    const task = (await listTasks(ctx)).find((t) => t.name === name);
    const tools = task?.allowed_tools as string[];
    expect(tools.some((t) => /^mcp_.+_\*$/.test(t))).toBe(true);
    expect(tools).toContain("notify");
  });

  test("YouTube automation carries the YouTube toolset", async ({ page }) => {
    const name = `${PREFIX} yt app`;
    await login(page);
    await page.goto("/apps");
    await page.getByRole("button", { name: /YouTube/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create automation" }).click();
    await page.waitForURL("**/tasks");
    const task = (await listTasks(ctx)).find((t) => t.name === name);
    expect(task?.allowed_tools).toEqual([
      "youtube_channel_feed", "youtube_transcript", "youtube_video_info", "notify",
    ]);
  });
});

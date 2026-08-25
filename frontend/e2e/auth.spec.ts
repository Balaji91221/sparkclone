import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiToken, login } from "./helpers";

/** Reveals the token form (collapsed when Google sign-in is enabled). */
async function openTokenForm(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Astra" })).toBeVisible();
  const reveal = page.getByRole("button", { name: "Use API token instead" });
  if (await reveal.isVisible()) await reveal.click();
}

test.describe("authentication", () => {
  test("offers Google sign-in when an allowlist is configured", async ({ page }) => {
    const res = await page.request.get("/auth/google/session");
    const body = (await res.json()) as { google_enabled?: unknown };
    test.skip(body.google_enabled !== true, "SPARK_ALLOWED_EMAILS not set");
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await page.goto("/?auth=denied&email=stranger%40example.com");
    await expect(page.getByText("is not allowed")).toBeVisible();
  });

  test("rejects a wrong token", async ({ page }) => {
    await openTokenForm(page);
    await page.getByPlaceholder("Paste your token").fill("not-the-token");
    await page.getByRole("button", { name: "Sign in with token" }).click();
    await expect(page.getByText("rejected by the backend")).toBeVisible();
  });

  test("accepts the real token and lands on Overview", async ({ page }) => {
    await openTokenForm(page);
    await page.getByPlaceholder("Paste your token").fill(apiToken());
    await page.getByRole("button", { name: "Sign in with token" }).click();
    await expect(page.getByRole("heading", { name: /Make progress/ })).toBeVisible();
    await expect(page.getByText("ACTIVE TASKS", { exact: false })).toBeVisible();
  });

  test("stored token skips the login screen", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page.getByText("ACTIVE TASKS", { exact: false })).toBeVisible();
  });
});

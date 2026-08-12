import { expect, test } from "@playwright/test";
import { apiToken, login } from "./helpers";

test.describe("authentication", () => {
  test("rejects a wrong token", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Astra" })).toBeVisible();
    await page.getByPlaceholder("Paste your token").fill("not-the-token");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("rejected by the backend")).toBeVisible();
  });

  test("accepts the real token and lands on Overview", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Paste your token").fill(apiToken());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /Put .*Astra.* to work/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask Astra" })).toBeVisible();
  });

  test("stored token skips the login screen", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page.getByText("ACTIVE TASKS", { exact: false })).toBeVisible();
  });
});

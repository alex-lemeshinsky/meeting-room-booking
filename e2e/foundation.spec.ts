import { expect, test } from "@playwright/test";

test("desktop shell and same-origin API are reachable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Meeting Rooms" })
  ).toBeVisible();

  const response = await page.request.get("/api/v1/health/live");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("foundation page fits the approved mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

import { expect, test, type Page } from "@playwright/test";
import { snapToLocalWeekStart } from "@mrb/time/calendar";
import { E2E_NOW_ISO } from "./support/e2e-clock";

const DISPLAY_TIMEZONE = "Europe/Kyiv";
const DNIPRO_ROOM_ID = "10000000-0000-4000-8000-000000000002";

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();

  await expect(page).toHaveURL(/\/rooms$/);
}

async function firstDayHeading(page: Page): Promise<string> {
  const heading = page.getByTestId("calendar-day-heading").first();
  await expect(heading).toBeVisible();
  return (await heading.textContent()) ?? "";
}

test.describe("Stage 10 calendar personalization", () => {
  test.use({
    timezoneId: DISPLAY_TIMEZONE
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(E2E_NOW_ISO);
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.goto("/settings");
      const select = page.getByLabel("Перший день тижня");
      if (await select.isVisible()) {
        await select.selectOption("1");
        await page.getByRole("button", { name: "Зберегти" }).click();
        await expect(page.getByRole("status")).toContainText(
          "Перший день тижня збережено"
        );
      }
    } catch {
      // Ignore cleanup failures if previous test failed before auth
    }
  });

  test("persists the week start and re-anchors the calendar", async ({
    page
  }) => {
    await loginAsSeededUser(page);

    await page.goto("/settings");
    const select = page.getByLabel("Перший день тижня");
    await expect(select).toHaveValue("1");

    await select.selectOption("7");
    await page.getByRole("button", { name: "Зберегти" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Перший день тижня збережено"
    );

    await page.goto(`/rooms/${DNIPRO_ROOM_ID}`);
    expect(await firstDayHeading(page)).toMatch(/^нд/i);

    await page.reload();
    expect(await firstDayHeading(page)).toMatch(/^нд/i);
  });

  test("snaps a Monday-anchored deep link to the viewer's week", async ({
    page
  }) => {
    await loginAsSeededUser(page);

    await page.goto("/settings");
    await page.getByLabel("Перший день тижня").selectOption("7");
    await page.getByRole("button", { name: "Зберегти" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Перший день тижня збережено"
    );

    const mondayWeek = snapToLocalWeekStart(
      new Date(E2E_NOW_ISO).toISOString().slice(0, 10),
      DISPLAY_TIMEZONE,
      1
    );
    await page.goto(`/rooms/${DNIPRO_ROOM_ID}?week=${mondayWeek}`);

    expect(await firstDayHeading(page)).toMatch(/^нд/i);
  });
});

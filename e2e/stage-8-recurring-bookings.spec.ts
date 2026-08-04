import { expect, test, type Page } from "@playwright/test";
import { E2E_NOW_ISO } from "./support/e2e-clock";

const DISPLAY_TIMEZONE = "Europe/Kyiv";
const ARSENAL_ROOM_ID = "10000000-0000-4000-8000-000000000001";

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
}

test.describe.serial("Stage 8 recurring bookings", () => {
  test.use({
    timezoneId: DISPLAY_TIMEZONE,
    viewport: { width: 1440, height: 900 }
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(E2E_NOW_ISO);
  });

  test("creates a weekly booking series and displays recurrence markers", async ({
    page
  }) => {
    await loginAsSeededUser(page);
    await page.goto(`/rooms/${ARSENAL_ROOM_ID}?week=2026-08-03`);
    await page.waitForLoadState("networkidle");

    const slotBtn = page.getByRole("button", {
      name: /Забронювати понеділок, 3 серпня 2026 р., 14:00/
    });
    await slotBtn.click();

    const sheet = page.getByRole("dialog", { name: "Нове бронювання" });
    await expect(sheet).toBeVisible();

    await page.getByLabel("Назва").fill("E2E Щотижнева синхронізація");
    await page.getByLabel("Повторювати щотижня").check();

    const countInput = page.getByLabel("Кількість повторень");
    await expect(countInput).toHaveValue("2");
    await countInput.fill("3");

    await sheet.getByRole("button", { name: "Забронювати" }).click();

    await expect(
      page.getByText("Серію бронювань створено (3 повторення): Арсенал.")
    ).toBeVisible();

    await expect(
      page.getByRole("article", {
        name: /E2E Щотижнева синхронізація. понеділок, 3 серпня 2026 р., 14:00–14:30. Моє. Частина повторюваної серії \(1 з 3\)/
      })
    ).toBeVisible();
  });

  test("cancels whole series from My Bookings", async ({ page }) => {
    await loginAsSeededUser(page);
    await page.goto("/my-bookings");
    await page.waitForLoadState("networkidle");

    const seriesRow = page
      .locator("li", {
        hasText: "E2E Щотижнева синхронізація"
      })
      .first();
    await expect(seriesRow).toBeVisible();
    await expect(seriesRow).toContainText("Частина повторюваної серії");

    await seriesRow.getByRole("button", { name: /Скасувати/ }).click();

    const dialog = page.getByRole("dialog", { name: "Скасувати бронювання" });
    await expect(dialog).toBeVisible();

    const wholeSeriesBtn = dialog.getByRole("button", { name: "Усю серію" });
    await expect(wholeSeriesBtn).toBeVisible();
    await wholeSeriesBtn.click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("скасовано");
  });
});

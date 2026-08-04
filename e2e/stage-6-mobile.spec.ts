import { expect, test, type Page } from "@playwright/test";
import { E2E_NOW_ISO } from "./support/e2e-clock";

test.describe("Stage 6 mobile journey", () => {
  test.use({
    timezoneId: "Europe/Kyiv",
    viewport: { width: 390, height: 844 }
  });

  test("filters, books, and cancels without leaving the mobile viewport", async ({
    page
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.clock.setFixedTime(E2E_NOW_ISO);
    await loginAsSeededUser(page);

    const capacityInput = page.getByRole("spinbutton", {
      name: "Мінімальна місткість"
    });
    await capacityInput.fill("12");
    await page.getByRole("button", { name: "Застосувати" }).click();

    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === "/rooms" &&
        url.searchParams.get("minCapacity") === "12"
      );
    });
    await expect(page.getByRole("heading", { name: "Поділ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Софія" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Обрій" })).toHaveCount(0);
    await expect(
      page
        .getByRole("list", { name: "Переговорні кімнати" })
        .getByRole("listitem")
    ).toHaveCount(2);
    await assertDocumentContained(page);

    const filterControls = page.locator(
      'input[name="minCapacity"], button[type="submit"], a[href="/rooms"]'
    );
    expect(
      await filterControls.evaluateAll((controls) =>
        controls.every((control) => {
          const bounds = control.getBoundingClientRect();
          return bounds.width >= 44 && bounds.height >= 44;
        })
      )
    ).toBe(true);

    await page.reload();
    await expect(capacityInput).toHaveValue("12");
    await page
      .getByRole("link", { name: "Відкрити розклад кімнати Софія" })
      .click();
    await page.getByRole("button", { name: "Наступний тиждень" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === "2026-08-10"
    );
    await page.getByRole("button", { name: "Наступний тиждень" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === "2026-08-17"
    );

    const retryMinutes = testInfo.retry * 30;
    const hour = 9 + Math.floor(retryMinutes / 60);
    const minute = retryMinutes % 60;
    const timeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const title = `Stage 6 mobile ${testInfo.retry}`;
    const slot = page.getByRole("button", {
      name: new RegExp(`Забронювати вівторок, 22 січня 2030 р., ${timeLabel}`)
    });
    await slot.scrollIntoViewIfNeeded();
    await slot.click();

    const bookingDialog = page.getByRole("dialog", { name: "Нове бронювання" });
    await expect(bookingDialog).toBeVisible();
    expect(
      await bookingDialog.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return (
          bounds.left === 0 &&
          bounds.top === 0 &&
          bounds.width === window.innerWidth &&
          bounds.height === window.innerHeight
        );
      })
    ).toBe(true);
    await bookingDialog.getByLabel("Назва").fill(title);
    await bookingDialog.getByRole("button", { name: "Забронювати" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Бронювання створено: Софія" })
    ).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
    await assertDocumentContained(page);

    await page.getByRole("link", { name: "Мої бронювання" }).click();
    const cancelTrigger = page.getByRole("button", {
      name: `Скасувати бронювання «${title}»`
    });
    await cancelTrigger.click();
    const cancelDialog = page.getByRole("dialog", {
      name: "Скасувати бронювання"
    });
    expect(
      await cancelDialog.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight
        );
      })
    ).toBe(true);
    await cancelDialog
      .getByRole("button", { name: "Скасувати бронювання" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      `Бронювання «${title}» скасовано.`
    );
    await assertDocumentContained(page);
    expect(consoleErrors).toEqual([]);
  });
});

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
}

async function assertDocumentContained(page: Page): Promise<void> {
  expect(
    await page
      .locator("html")
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
}

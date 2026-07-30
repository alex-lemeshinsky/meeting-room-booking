import { expect, test, type Page } from "@playwright/test";
import { E2E_NOW_ISO } from "./support/e2e-clock";

const ROOM_ID = "10000000-0000-4000-8000-000000000001";

test.describe.serial("My Bookings", () => {
  test.use({
    timezoneId: "Europe/Kyiv",
    viewport: { width: 1440, height: 900 }
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(E2E_NOW_ISO);
    await loginAsSeededUser(page);
  });

  test("opens a booking in its calendar week and cancels it into history", async ({
    page
  }, testInfo) => {
    const title = `E2E скасування ${testInfo.retry}`;
    await createBookingViaBrowser(page, {
      title,
      startAt: new Date(
        Date.parse("2030-01-11T07:00:00.000Z") +
          testInfo.retry * 30 * 60 * 1_000
      ).toISOString()
    });

    await page.getByRole("link", { name: "Мої" }).click();
    await expect(page).toHaveURL(/\/my-bookings$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Мої бронювання" })
    ).toBeVisible();
    const calendarLink = page.getByRole("link", {
      name: `Відкрити бронювання «${title}» в календарі`
    });
    await expect(calendarLink).toContainText("Арсенал");
    await expect(calendarLink).toContainText("11.01.2030");

    await calendarLink.click();
    await expect(page).toHaveURL((url) => {
      return (
        url.pathname === `/rooms/${ROOM_ID}` &&
        url.searchParams.get("week") === "2030-01-07"
      );
    });
    await expect(
      page.getByRole("heading", { name: "Розклад кімнати Арсенал" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Мої" }).click();
    const trigger = page.getByRole("button", {
      name: `Скасувати бронювання «${title}»`
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Скасувати бронювання"
    });
    await expect(
      dialog.getByRole("button", { name: "Залишити бронювання" })
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Скасувати бронювання" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(
      `Бронювання «${title}» скасовано.`
    );
    await expect(
      page.getByRole("link", {
        name: `Відкрити бронювання «${title}» в календарі`
      })
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Історія" }).click();
    const historyLink = page.getByRole("link", {
      name: `Відкрити бронювання «${title}» в календарі`
    });
    await expect(historyLink).toBeVisible();
    await expect(historyLink).toContainText("Скасовано");
    await expect(
      page.getByRole("button", {
        name: `Скасувати бронювання «${title}»`
      })
    ).toHaveCount(0);
  });

  test("contains the mobile layout and preserves cancellation after an API error", async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const title = `E2E mobile cancellation ${testInfo.retry}`;
    const created = await createBookingViaBrowser(page, {
      title,
      startAt: new Date(
        Date.parse("2030-01-11T09:00:00.000Z") +
          testInfo.retry * 30 * 60 * 1_000
      ).toISOString()
    });
    await page.getByRole("link", { name: "Мої" }).click();

    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);
    const primaryNavigation = page.getByRole("navigation", {
      name: "Основна навігація"
    });
    await expect(primaryNavigation).toBeVisible();
    expect(
      await primaryNavigation.getByRole("link").evaluateAll((links) =>
        links.every((link) => {
          const bounds = link.getBoundingClientRect();
          return bounds.width >= 44 && bounds.height >= 44;
        })
      )
    ).toBe(true);

    const cancellationUrl = `**/api/v1/bookings/${created.id}/cancel`;
    await page.route(cancellationUrl, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "BOOKING_ALREADY_ENDED",
            message: "Booking already ended",
            requestId: "my-bookings-mobile-e2e"
          }
        }),
        contentType: "application/json",
        status: 409
      });
    });

    const trigger = page.getByRole("button", {
      name: `Скасувати бронювання «${title}»`
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Скасувати бронювання"
    });
    expect(
      await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight
        );
      })
    ).toBe(true);
    await dialog.getByRole("button", { name: "Скасувати бронювання" }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toHaveText(
      "Це бронювання вже завершилося і його не можна скасувати."
    );
    await expect(alert).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole("link", {
        name: `Відкрити бронювання «${title}» в календарі`
      })
    ).toBeVisible();

    await page.unroute(cancellationUrl);
    await trigger.click();
    await page
      .getByRole("dialog", { name: "Скасувати бронювання" })
      .getByRole("button", { name: "Скасувати бронювання" })
      .click();
    const successToast = page.getByRole("status");
    await expect(successToast).toHaveText(`Бронювання «${title}» скасовано.`);
    expect(
      await successToast.evaluate((element) => {
        const navigation = document.querySelector(
          'nav[aria-label="Основна навігація"]'
        );
        if (!(navigation instanceof HTMLElement)) return false;

        return (
          element.getBoundingClientRect().bottom <=
          navigation.getBoundingClientRect().top
        );
      })
    ).toBe(true);
  });
});

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
}

async function createBookingViaBrowser(
  page: Page,
  input: { title: string; startAt: string }
): Promise<{ id: string }> {
  return page.evaluate(
    async ({ roomId, title, startAt }) => {
      const csrfCookie = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith("mrb_csrf="));
      if (!csrfCookie) throw new Error("Missing CSRF cookie");
      const csrfToken = decodeURIComponent(
        csrfCookie.slice("mrb_csrf=".length)
      );
      const endAt = new Date(
        Date.parse(startAt) + 30 * 60 * 1_000
      ).toISOString();
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ roomId, title, startAt, endAt })
      });
      const body = (await response.json()) as {
        booking?: { id: string };
        error?: { code: string };
      };
      if (!response.ok || body.booking === undefined) {
        throw new Error(
          `Booking setup failed: ${body.error?.code ?? "unknown"}`
        );
      }
      return body.booking;
    },
    { roomId: ROOM_ID, ...input }
  );
}

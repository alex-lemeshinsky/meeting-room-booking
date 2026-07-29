import { expect, test, type Page } from "@playwright/test";
import {
  getCurrentLocalWeekStart,
  shiftLocalWeekStart
} from "@mrb/time/calendar";

const DISPLAY_TIMEZONE = "Europe/Kyiv";
const DNIPRO_BOOKING_ID = "20000000-0000-4000-8000-000000000001";

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();

  await expect(page).toHaveURL(/\/rooms$/);
  await expect(
    page.getByRole("heading", { name: "Переговорні кімнати" })
  ).toBeVisible();
}

async function openCurrentDniproSchedule(page: Page): Promise<string> {
  const currentWeek = getCurrentLocalWeekStart(DISPLAY_TIMEZONE);

  await page
    .getByRole("link", { name: "Відкрити розклад кімнати Дніпро" })
    .click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/rooms/10000000-0000-4000-8000-000000000002" &&
      url.searchParams.get("week") === currentWeek
    );
  });
  await expect(
    page.getByRole("heading", { name: "Розклад кімнати Дніпро" })
  ).toBeVisible();

  return currentWeek;
}

test.describe("read-only weekly calendar", () => {
  test.use({
    timezoneId: DISPLAY_TIMEZONE,
    viewport: { width: 1440, height: 900 }
  });

  test("opens the seeded room schedule and navigates current, next, and previous weeks", async ({
    page
  }) => {
    await loginAsSeededUser(page);
    const currentWeek = await openCurrentDniproSchedule(page);
    await expect(page.getByTestId("calendar-scroll-region")).toBeVisible();
    const nextWeek = shiftLocalWeekStart(currentWeek, DISPLAY_TIMEZONE, 1);
    const previousWeek = shiftLocalWeekStart(currentWeek, DISPLAY_TIMEZONE, -1);
    const booking = page.locator(
      `[data-booking-id="${DNIPRO_BOOKING_ID}"][data-testid="booking-fragment"]`
    );

    await expect(booking).toContainText("Планування спринту");
    await expect(booking).toContainText("Моє");
    const browserTimezone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    await expect(
      page.getByText(`Ваш часовий пояс: ${browserTimezone}`)
    ).toBeVisible();
    await expect(page.getByText("Офіс: Europe/Kyiv")).toBeVisible();

    const dayHeaders = page.locator('[data-testid^="calendar-day-header-"]');
    await expect(dayHeaders).toHaveCount(7);
    expect(
      await dayHeaders.evaluateAll((headers) =>
        headers.every((header) => {
          const bounds = header.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= window.innerWidth;
        })
      )
    ).toBe(true);

    await page.getByRole("button", { name: "Наступний тиждень" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === nextWeek
    );
    await expect(page.getByText("Оберіть вільний слот")).toBeVisible();

    await page.getByRole("button", { name: "Поточний тиждень" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === currentWeek
    );
    await expect(booking).toContainText("Планування спринту");

    await page.getByRole("button", { name: "Попередній тиждень" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === previousWeek
    );
    await expect(page.getByText("Оберіть вільний слот")).toBeVisible();
  });

  test("recovers the selected week after a schedule request fails", async ({
    page
  }) => {
    await loginAsSeededUser(page);
    let failScheduleRequest = true;

    await page.route(
      /\/api\/v1\/rooms\/[^/]+\/schedule(?:\?|$)/,
      async (route) => {
        if (!failScheduleRequest) {
          await route.continue();
          return;
        }

        await route.fulfill({
          body: JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Тестова тимчасова помилка.",
              requestId: "calendar-e2e"
            }
          }),
          contentType: "application/json",
          status: 503
        });
      }
    );

    const currentWeek = await openCurrentDniproSchedule(page);
    await expect(
      page.getByRole("heading", { name: "Не вдалося завантажити розклад" })
    ).toBeVisible();

    failScheduleRequest = false;
    await page.getByRole("button", { name: "Спробувати ще" }).click();

    await expect(page).toHaveURL(
      (url) => url.searchParams.get("week") === currentWeek
    );
    await expect(
      page.locator(
        `[data-booking-id="${DNIPRO_BOOKING_ID}"][data-testid="booking-fragment"]`
      )
    ).toContainText("Планування спринту");
    await expect(
      page.getByRole("heading", { name: "Не вдалося завантажити розклад" })
    ).toHaveCount(0);
  });

  test("keeps the 390px page contained while all seven days remain reachable", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSeededUser(page);
    await openCurrentDniproSchedule(page);

    const scrollRegion = page.getByTestId("calendar-scroll-region");
    await expect(scrollRegion).toBeVisible();
    const dayHeaders = scrollRegion.locator(
      '[data-testid^="calendar-day-header-"]'
    );
    const currentDayHeader = scrollRegion.locator(
      '[data-testid^="calendar-day-header-"][aria-current="date"]'
    );

    await expect(dayHeaders).toHaveCount(7);
    await expect(currentDayHeader).toHaveCount(1);
    expect(
      await page.locator("html").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth;
      })
    ).toBe(true);
    expect(
      await page.locator("body").evaluate((element) => {
        return element.scrollWidth <= element.clientWidth;
      })
    ).toBe(true);

    const scrollMetrics = await scrollRegion.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        overflowX: styles.overflowX,
        scrollWidth: element.scrollWidth
      };
    });
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(
      scrollMetrics.clientWidth
    );
    expect(["auto", "scroll"]).toContain(scrollMetrics.overflowX);

    const visibleDayCount = await dayHeaders.evaluateAll((headers) => {
      const region = headers[0]?.closest(
        '[data-testid="calendar-scroll-region"]'
      );
      if (!region) return 0;

      const viewport = region.getBoundingClientRect();
      const contentLeft = viewport.left + 72;
      return headers.filter((header) => {
        const bounds = header.getBoundingClientRect();
        const visibleWidth =
          Math.min(bounds.right, viewport.right) -
          Math.max(bounds.left, contentLeft);
        return visibleWidth >= bounds.width / 2;
      }).length;
    });
    expect(visibleDayCount).toBeGreaterThanOrEqual(2);
    expect(visibleDayCount).toBeLessThanOrEqual(4);

    expect(
      await currentDayHeader.evaluate((header) => {
        const region = header.closest('[data-testid="calendar-scroll-region"]');
        if (!region) return false;

        const viewport = region.getBoundingClientRect();
        const bounds = header.getBoundingClientRect();
        return (
          bounds.right > viewport.left + 72 && bounds.left < viewport.right
        );
      })
    ).toBe(true);

    const touchTargets = page.locator(
      ['a[href="/rooms"]', 'nav[aria-label="Навігація тижнями"] button'].join(
        ","
      )
    );
    await expect(touchTargets).toHaveCount(4);
    expect(
      await touchTargets.evaluateAll((elements) =>
        elements.every((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.height >= 44 && bounds.width >= 44;
        })
      )
    ).toBe(true);
    expect(
      await page
        .getByTestId("calendar-slot")
        .first()
        .evaluate((element) => element.getBoundingClientRect().height >= 44)
    ).toBe(true);

    await scrollRegion.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await expect(dayHeaders.first()).toBeInViewport();

    await scrollRegion.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(dayHeaders.last()).toBeInViewport();
  });
});

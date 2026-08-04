import { expect, test, type Page } from "@playwright/test";
import { E2E_NOW_ISO } from "./support/e2e-clock";

const DISPLAY_TIMEZONE = "Europe/Kyiv";
const PODIL_ROOM_ID = "10000000-0000-4000-8000-000000000005";

async function loginAsSeededUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("olena@example.com");
  await page.getByLabel("Пароль").fill("Rooms123!");
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
}

test.describe.serial("Stage 9 notifications flow", () => {
  test.use({
    timezoneId: DISPLAY_TIMEZONE,
    viewport: { width: 1440, height: 900 }
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(E2E_NOW_ISO);
  });

  test("creates back-to-back bookings, triggers scheduler, shows unread bell badge, opens panel, and marks notification as read", async ({
    page
  }) => {
    // 1. Log in as test user Olena
    await loginAsSeededUser(page);

    // Get CSRF token and origin for API helper calls
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === "mrb_csrf");
    const csrfToken = csrfCookie ? csrfCookie.value : "";
    const origin = new URL(page.url()).origin;

    // 2. Create back-to-back bookings in room "Поділ"
    // E2E_NOW_ISO is 2026-08-03T10:00:00.000Z
    // Booking A: 10:30 - 11:00 UTC
    // Booking B: 11:00 - 11:30 UTC
    const bookingARes = await page.request.post("/api/v1/bookings", {
      headers: {
        "x-csrf-token": csrfToken,
        origin
      },
      data: {
        roomId: PODIL_ROOM_ID,
        title: "E2E Зустріч A",
        startAt: "2026-08-03T10:30:00.000Z",
        endAt: "2026-08-03T11:00:00.000Z"
      }
    });
    expect(bookingARes.ok()).toBe(true);

    const bookingBRes = await page.request.post("/api/v1/bookings", {
      headers: {
        "x-csrf-token": csrfToken,
        origin
      },
      data: {
        roomId: PODIL_ROOM_ID,
        title: "E2E Зустріч B",
        startAt: "2026-08-03T11:00:00.000Z",
        endAt: "2026-08-03T11:30:00.000Z"
      }
    });
    expect(bookingBRes.ok()).toBe(true);

    // 3. Wait for notification processing / SSE push to deliver unread notification
    // 4. Verify bell icon badge shows unread count (1)
    const bellButton = page.getByRole("button", {
      name: /Сповіщення \(1 непрочитаних\)/
    });
    await expect(bellButton).toBeVisible({ timeout: 25_000 });

    // 5. Open notification panel, verify Ukrainian message content
    await bellButton.click();
    const panel = page.getByRole("region", { name: "Панель сповіщень" });
    await expect(panel).toBeVisible();

    const notifMessage = page.getByText(
      "«E2E Зустріч A» у Поділ завершується за 60 хв — наступне бронювання починається одразу"
    );
    await expect(notifMessage).toBeVisible();

    // 6. Click notification to mark as read, verify unread badge clears
    await notifMessage.click();

    // Verify navigation to /my-bookings
    await expect(page).toHaveURL(/\/my-bookings$/);

    // Verify unread badge clears on bell button (aria-label becomes "Сповіщення")
    const clearedBellButton = page.getByRole("button", {
      name: "Сповіщення",
      exact: true
    });
    await expect(clearedBellButton).toBeVisible({ timeout: 10_000 });
    await expect(clearedBellButton).toHaveAttribute("aria-label", "Сповіщення");
  });
});

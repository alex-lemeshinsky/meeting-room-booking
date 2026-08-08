import { expect, test, type Page } from "@playwright/test";
import { E2E_NOW_ISO } from "./support/e2e-clock";
import {
  STAGE7_DESKTOP_TOKEN,
  STAGE7_MOBILE_ACCOUNT,
  STAGE7_MOBILE_TOKEN
} from "./support/email-verification-fixtures";

const DNIPRO_ROOM_ID = "10000000-0000-4000-8000-000000000002";
const VERIFICATION_ERROR =
  "Підтвердьте email за посиланням із журналу API, щоб створювати бронювання.";
const MOBILE_BOOKING_TITLE = "Stage 7 mobile booking";
const MOBILE_BOOKING_END = "2026-08-06T09:30:00.000Z";

test.describe.serial("Stage 7 email verification", () => {
  test.use({ timezoneId: "Europe/Kyiv" });

  test("disables retries for the stateful verification journey", () => {
    expect(test.info().project.retries).toBe(0);
  });

  test("confirms a desktop token only after the explicit action and rejects reuse", async ({
    page
  }) => {
    const diagnostics = collectBrowserDiagnostics(page);
    let verificationPosts = 0;
    let urlWhenPosted: string | undefined;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "POST" &&
        url.pathname === "/api/v1/auth/verify-email"
      ) {
        verificationPosts += 1;
        urlWhenPosted = page.url();
      }
    });

    await page.goto(`/verify-email?token=${STAGE7_DESKTOP_TOKEN}`);
    const confirm = page.getByRole("button", { name: "Підтвердити email" });
    await expect(confirm).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(verificationPosts).toBe(0);

    await confirm.click();

    await expect(page).toHaveURL("/verify-email");
    expect(urlWhenPosted).toBe("http://127.0.0.1:3000/verify-email");
    await expect(
      page.getByRole("heading", { name: "Email підтверджено" })
    ).toBeFocused();
    await expect(page.getByRole("link", { name: "Увійти" })).toHaveAttribute(
      "href",
      "/login"
    );

    await page.goto(`/verify-email?token=${STAGE7_DESKTOP_TOKEN}`);
    const reuseResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/verify-email"
      );
    });
    await page.getByRole("button", { name: "Підтвердити email" }).click();
    expect((await reuseResponsePromise).status()).toBe(409);
    await expect(page).toHaveURL("/verify-email");
    const usedAlert = page
      .getByRole("alert")
      .filter({ hasText: "Це посилання вже використано." });
    await expect(usedAlert).toContainText("Це посилання вже використано.");
    await expect(usedAlert).toBeFocused();
    await expect
      .poll(() => diagnostics.consoleErrors)
      .toEqual([
        {
          source: "/api/v1/auth/verify-email",
          text: "Failed to load resource: the server responded with a status of 409 (Conflict)"
        }
      ]);
    expect(diagnostics.pageErrors).toEqual([]);
  });

  test("allows mobile reads, blocks booking until verification, then creates it", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(E2E_NOW_ISO);
    const diagnostics = collectBrowserDiagnostics(page);

    await login(
      page,
      STAGE7_MOBILE_ACCOUNT.email,
      STAGE7_MOBILE_ACCOUNT.password
    );
    await expect(
      page.getByRole("heading", { name: "Переговорні кімнати" })
    ).toBeVisible();

    const scheduleResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === `/api/v1/rooms/${DNIPRO_ROOM_ID}/schedule`
      );
    });
    await page
      .getByRole("link", { name: "Відкрити розклад кімнати Дніпро" })
      .click();
    const scheduleUrl = new URL((await scheduleResponse).url());
    const schedulePath = `${scheduleUrl.pathname}${scheduleUrl.search}`;
    await expect(
      page.getByRole("heading", { name: "Розклад кімнати Дніпро" })
    ).toBeVisible();

    const slot = page.getByRole("button", {
      name: /Забронювати четвер, 6 серпня 2026 р., 11:30/
    });
    await slot.scrollIntoViewIfNeeded();
    await slot.click();

    const dialog = page.getByRole("dialog", { name: "Нове бронювання" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Назва").fill(MOBILE_BOOKING_TITLE);
    await dialog.getByLabel("Завершення").selectOption(MOBILE_BOOKING_END);
    const deniedBookingResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/bookings"
      );
    });
    await dialog.getByRole("button", { name: "Забронювати" }).click();
    expect((await deniedBookingResponsePromise).status()).toBe(403);

    const alert = dialog.getByRole("alert");
    await expect(alert).toHaveText(VERIFICATION_ERROR);
    await expect(alert).toBeFocused();
    await expect(dialog.getByLabel("Назва")).toHaveValue(MOBILE_BOOKING_TITLE);
    await expect(dialog.getByLabel("Завершення")).toHaveValue(
      MOBILE_BOOKING_END
    );
    await expect(
      dialog.getByRole("button", { name: "Забронювати" })
    ).toBeEnabled();
    expect(await isFullScreen(dialog)).toBe(true);
    await assertControlsAtLeast44(dialog);
    expect(
      await scheduleContainsBooking(page, schedulePath, MOBILE_BOOKING_TITLE)
    ).toBe(false);

    await page.goto(`/verify-email?token=${STAGE7_MOBILE_TOKEN}`);
    await assertDocumentContained(page);
    const verifyButton = page.getByRole("button", {
      name: "Підтвердити email"
    });
    expect(await hasMinimumTarget(verifyButton)).toBe(true);
    await verifyButton.click();
    await expect(page).toHaveURL("/verify-email");
    await expect(
      page.getByRole("heading", { name: "Email підтверджено" })
    ).toBeFocused();

    await page.goto(`/rooms/${DNIPRO_ROOM_ID}?week=2026-08-03`);
    await expect(
      page.getByRole("heading", { name: "Розклад кімнати Дніпро" })
    ).toBeVisible();
    const retrySlot = page.getByRole("button", {
      name: /Забронювати четвер, 6 серпня 2026 р., 11:30/
    });
    await retrySlot.scrollIntoViewIfNeeded();
    await retrySlot.click();
    const retryDialog = page.getByRole("dialog", { name: "Нове бронювання" });
    await retryDialog.getByLabel("Назва").fill(MOBILE_BOOKING_TITLE);
    await retryDialog.getByLabel("Завершення").selectOption(MOBILE_BOOKING_END);
    await retryDialog.getByRole("button", { name: "Забронювати" }).click();

    await expect(retryDialog).toHaveCount(0);
    await expect(page.getByText(MOBILE_BOOKING_TITLE)).toBeVisible();
    await assertDocumentContained(page);
    await expect
      .poll(() => diagnostics.consoleErrors)
      .toEqual([
        {
          source: "/api/v1/bookings",
          text: "Failed to load resource: the server responded with a status of 403 (Forbidden)"
        }
      ]);
    expect(diagnostics.pageErrors).toEqual([]);
  });
});

interface BrowserDiagnostics {
  consoleErrors: { source: string; text: string }[];
  pageErrors: string[];
}

function collectBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: []
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const sourceUrl = message.location().url;
    diagnostics.consoleErrors.push({
      source: sourceUrl ? new URL(sourceUrl).pathname : "",
      text: message.text()
    });
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
  });
  return diagnostics;
}

async function login(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
}

async function isFullScreen(
  locator: ReturnType<Page["locator"]>
): Promise<boolean> {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return (
      bounds.left === 0 &&
      bounds.top === 0 &&
      bounds.width === window.innerWidth &&
      bounds.height === window.innerHeight
    );
  });
}

async function assertControlsAtLeast44(
  locator: ReturnType<Page["locator"]>
): Promise<void> {
  const controls = locator.locator(
    "button, input:not([type='checkbox']), select, label:has(input[type='checkbox'])"
  );
  const undersized = await controls.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44
        ? []
        : [
            {
              element: element.outerHTML,
              height: bounds.height,
              width: bounds.width
            }
          ];
    })
  );
  expect(undersized).toEqual([]);
}

async function hasMinimumTarget(
  locator: ReturnType<Page["locator"]>
): Promise<boolean> {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width >= 44 && bounds.height >= 44;
  });
}

async function assertDocumentContained(page: Page): Promise<void> {
  expect(
    await page
      .locator("html")
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
}

async function scheduleContainsBooking(
  page: Page,
  schedulePath: string,
  title: string
): Promise<boolean> {
  return page.evaluate(
    async ({ path, expectedTitle }) => {
      const response = await fetch(path, { credentials: "same-origin" });
      if (!response.ok)
        throw new Error(`Schedule check failed: ${response.status}`);
      const payload = (await response.json()) as {
        bookings?: { title: string }[];
      };
      return (
        payload.bookings?.some((booking) => booking.title === expectedTitle) ??
        false
      );
    },
    { path: schedulePath, expectedTitle: title }
  );
}

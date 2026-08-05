import { expect, test } from "@playwright/test";

function accountEmail(prefix: string, retry: number): string {
  return `${prefix}.retry-${retry}@example.com`;
}

test.describe.serial("authentication and rooms", () => {
  test("registers, restores a session, and protects rooms after logout", async ({
    page
  }, testInfo) => {
    const email = accountEmail("journey", testInfo.retry);

    await page.goto("/rooms");
    await expect(page).toHaveURL(/\/login$/);
    const authPanel = await page.locator("main > section").evaluate((panel) => {
      const style = getComputedStyle(panel);
      return {
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
        padding: style.padding
      };
    });
    expect(authPanel).toEqual({
      background: "rgb(255, 255, 255)",
      borderRadius: "12px",
      padding: "32px"
    });

    await page.getByRole("link", { name: "Створити обліковий запис" }).click();
    await page.getByLabel("Ім’я").fill("Тестова користувачка");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("Journey123!");
    await page.getByRole("button", { name: "Зареєструватися" }).click();

    await expect(page).toHaveURL(/\/login\?registered=1/);
    await expect(page.getByRole("status")).toHaveText(
      "Обліковий запис створено. Посилання для підтвердження email доступне в журналі API для локальної розробки. Ви вже можете увійти й переглядати розклад."
    );
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("Journey123!");
    await page.getByRole("button", { name: "Увійти" }).click();

    await expect(page).toHaveURL(/\/rooms/);
    await expect(
      page.getByRole("heading", { name: "Переговорні кімнати" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Дніпро" })).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Переговорні кімнати" })
        .getByRole("listitem")
    ).toHaveCount(6);
    await expect(
      page.getByRole("link", { name: "Мої бронювання" })
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/rooms/);

    await page.getByRole("button", { name: "Вийти" }).click();
    await expect(page).toHaveURL(/\/login\?loggedOut=1/);
    await page.goto("/rooms");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("fits authentication and rooms pages at the approved mobile viewport", async ({
    page
  }, testInfo) => {
    const email = accountEmail("mobile", testInfo.retry);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);

    await page.getByRole("link", { name: "Створити обліковий запис" }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByLabel("Ім’я")).toBeVisible();
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);
    await page.getByLabel("Ім’я").fill("Мобільна користувачка");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("Mobile123!");
    await page.getByRole("button", { name: "Зареєструватися" }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill("Mobile123!");
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page).toHaveURL(/\/rooms/);
    await expect(
      page
        .getByRole("list", { name: "Переговорні кімнати" })
        .getByRole("listitem")
    ).toHaveCount(6);
    const mobileMetrics = await page
      .getByRole("navigation", { name: "Основна навігація" })
      .evaluate((navigation) => {
        const rect = navigation.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
          pageOverflow:
            document.documentElement.scrollWidth > window.innerWidth,
          targets: Array.from(navigation.querySelectorAll("a")).map(
            (link) => link.getBoundingClientRect().height
          )
        };
      });
    expect(mobileMetrics.pageOverflow).toBe(false);
    expect(
      mobileMetrics.targets.every((targetHeight) => targetHeight >= 44)
    ).toBe(true);
    expect(
      Math.abs(mobileMetrics.bottom - mobileMetrics.viewportHeight)
    ).toBeLessThanOrEqual(1);
  });
});

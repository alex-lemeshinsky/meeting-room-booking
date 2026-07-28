import { expect, test } from "@playwright/test";

test.describe.serial("authentication and rooms", () => {
  test("registers, restores a session, and protects rooms after logout", async ({
    page
  }) => {
    await page.goto("/rooms");
    await expect(page).toHaveURL(/\/login\?reason=session/);

    await page.getByRole("link", { name: "Створити обліковий запис" }).click();
    await page.getByLabel("Ім’я").fill("Тестова користувачка");
    await page.getByLabel("Email").fill("journey@example.com");
    await page.getByLabel("Пароль").fill("Journey123!");
    await page.getByRole("button", { name: "Зареєструватися" }).click();

    await expect(page).toHaveURL(/\/login\?registered=1/);
    await page.getByLabel("Email").fill("journey@example.com");
    await page.getByLabel("Пароль").fill("Journey123!");
    await page.getByRole("button", { name: "Увійти" }).click();

    await expect(page).toHaveURL(/\/rooms/);
    await expect(
      page.getByRole("heading", { name: "Переговорні кімнати" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Дніпро" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/rooms/);

    await page.getByRole("button", { name: "Вийти" }).click();
    await expect(page).toHaveURL(/\/login\?loggedOut=1/);
    await page.goto("/rooms");
    await expect(page).toHaveURL(/\/login\?reason=session/);
  });

  test("fits authentication and rooms pages at the approved mobile viewport", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);

    await page.getByRole("link", { name: "Створити обліковий запис" }).click();
    await page.getByLabel("Ім’я").fill("Мобільна користувачка");
    await page.getByLabel("Email").fill("mobile@example.com");
    await page.getByLabel("Пароль").fill("Mobile123!");
    await page.getByRole("button", { name: "Зареєструватися" }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/);

    await page.getByLabel("Email").fill("mobile@example.com");
    await page.getByLabel("Пароль").fill("Mobile123!");
    await page.getByRole("button", { name: "Увійти" }).click();
    await expect(page).toHaveURL(/\/rooms/);
    expect(
      await page
        .locator("html")
        .evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);
  });
});

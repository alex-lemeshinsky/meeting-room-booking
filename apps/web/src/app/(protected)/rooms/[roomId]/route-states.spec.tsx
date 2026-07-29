import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleError from "./error";
import ScheduleLoading from "./loading";
import ScheduleNotFound from "./not-found";

const router = {
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

afterEach(() => {
  cleanup();
  router.refresh.mockReset();
});

describe("room schedule route states", () => {
  it("keeps room-schedule loading geometry stable", () => {
    render(<ScheduleLoading />);

    expect(screen.getByLabelText("Завантажуємо розклад кімнати")).toBeVisible();
  });

  it("refreshes the failed server route while resetting its error boundary", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleError error={new Error("failed")} reset={reset} />);

    expect(
      screen.getByRole("heading", {
        name: "Не вдалося завантажити розклад кімнати"
      })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("explains a missing room and links back to the room list", () => {
    render(<ScheduleNotFound />);

    expect(
      screen.getByRole("heading", { name: "Кімнату не знайдено" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Повернутися до кімнат" })
    ).toHaveAttribute("href", "/rooms");
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as ReactModule from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleError from "./error";
import ScheduleLoading from "./loading";
import ScheduleNotFound from "./not-found";

const { recoveryOrder, startTransition } = vi.hoisted(() => ({
  recoveryOrder: [] as string[],
  startTransition: vi.fn((recovery: () => void) => {
    recoveryOrder.push("transition:start");
    recovery();
    recoveryOrder.push("transition:end");
  })
}));

const router = {
  refresh: vi.fn(() => recoveryOrder.push("refresh"))
};

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactModule>()),
  startTransition
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

afterEach(() => {
  cleanup();
  recoveryOrder.length = 0;
  router.refresh.mockClear();
  startTransition.mockClear();
});

describe("room schedule route states", () => {
  it("keeps room-schedule loading geometry stable", () => {
    render(<ScheduleLoading />);

    expect(screen.getByLabelText("Завантажуємо розклад кімнати")).toBeVisible();
  });

  it("refreshes the failed server route while resetting its error boundary", async () => {
    const reset = vi.fn(() => recoveryOrder.push("reset"));
    const user = userEvent.setup();
    render(<ScheduleError error={new Error("failed")} reset={reset} />);

    expect(
      screen.getByRole("heading", {
        name: "Не вдалося завантажити розклад кімнати"
      })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(startTransition).toHaveBeenCalledOnce();
    expect(recoveryOrder).toEqual([
      "transition:start",
      "refresh",
      "reset",
      "transition:end"
    ]);
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "До списку кімнат" })
    ).toHaveAttribute("href", "/rooms");
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

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekToolbar } from "./week-toolbar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
});

describe("WeekToolbar", () => {
  it("renders compact labels without changing accessible navigation names", () => {
    const onWeekChange = vi.fn();
    render(
      <WeekToolbar
        weekStart="2026-07-27"
        timezone="Europe/Kyiv"
        weekStartsOn={1}
        onWeekChange={onWeekChange}
      />
    );

    const previous = screen.getByRole("button", {
      name: "Попередній тиждень"
    });
    const current = screen.getByRole("button", { name: "Поточний тиждень" });
    const next = screen.getByRole("button", { name: "Наступний тиждень" });

    expect(within(previous).getByText("←")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(within(current).getByText("Сьогодні")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(within(next).getByText("→")).toHaveAttribute("aria-hidden", "true");
  });

  it("moves to the previous local Monday", () => {
    const onWeekChange = vi.fn();
    render(
      <WeekToolbar
        weekStart="2026-07-27"
        timezone="Europe/Kyiv"
        weekStartsOn={1}
        onWeekChange={onWeekChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Попередній тиждень" }));

    expect(onWeekChange).toHaveBeenCalledWith("2026-07-20");
  });

  it("returns to the current local Monday", () => {
    const onWeekChange = vi.fn();
    render(
      <WeekToolbar
        weekStart="2026-08-10"
        timezone="Europe/Kyiv"
        weekStartsOn={1}
        onWeekChange={onWeekChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Поточний тиждень" }));

    expect(onWeekChange).toHaveBeenCalledWith("2026-07-27");
  });

  it("moves to the next local Monday", () => {
    const onWeekChange = vi.fn();
    render(
      <WeekToolbar
        weekStart="2026-07-27"
        timezone="Europe/Kyiv"
        weekStartsOn={1}
        onWeekChange={onWeekChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Наступний тиждень" }));

    expect(onWeekChange).toHaveBeenCalledWith("2026-08-03");
  });
});

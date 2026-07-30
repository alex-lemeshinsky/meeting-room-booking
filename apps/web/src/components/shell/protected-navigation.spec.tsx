import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn()
}));

vi.mock("next/navigation", () => ({ usePathname }));

import { ProtectedNavigation } from "./protected-navigation";

afterEach(() => {
  cleanup();
  usePathname.mockReset();
});

describe("ProtectedNavigation", () => {
  it("links the primary protected destinations and marks the current one", () => {
    usePathname.mockReturnValue("/my-bookings");

    render(<ProtectedNavigation />);

    const navigation = screen.getByRole("navigation", {
      name: "Основна навігація"
    });
    expect(
      within(navigation).getByRole("link", { name: "Кімнати" })
    ).toHaveAttribute("href", "/rooms");
    expect(
      within(navigation).getByRole("link", { name: "Мої" })
    ).toHaveAttribute("href", "/my-bookings");
    expect(
      within(navigation).getByRole("link", { name: "Мої" })
    ).toHaveAttribute("aria-current", "page");
  });
});

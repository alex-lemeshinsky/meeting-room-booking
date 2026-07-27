import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("foundation page", () => {
  it("identifies the product and exposes one primary next action", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Meeting Rooms" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Перевірити API" })
    ).toHaveAttribute("href", "/api/v1/health/live");
  });
});

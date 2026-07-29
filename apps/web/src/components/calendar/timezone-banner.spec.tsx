import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimezoneBanner } from "./timezone-banner";

afterEach(cleanup);

describe("TimezoneBanner", () => {
  it("shows the user zone, office zone, and office-hours explanation", () => {
    render(<TimezoneBanner timezone="America/New_York" />);

    expect(
      screen.getByText("Ваш часовий пояс: America/New_York")
    ).toBeVisible();
    expect(screen.getByText("Офіс: Europe/Kyiv")).toBeVisible();
    expect(
      screen.getByText("Робочі години перевіряються за київським часом.")
    ).toBeVisible();
  });
});

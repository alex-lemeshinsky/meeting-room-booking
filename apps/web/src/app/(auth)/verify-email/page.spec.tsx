import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerifyEmailPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => "A".repeat(43) })
}));

afterEach(cleanup);

describe("VerifyEmailPage", () => {
  it("renders the public auth shell and confirmation heading", () => {
    render(<VerifyEmailPage />);

    expect(
      screen.getByRole("heading", { name: "Підтвердження email" })
    ).toBeVisible();
    expect(screen.getByText("Meeting Rooms")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Підтвердити email" })
    ).toBeVisible();
  });
});

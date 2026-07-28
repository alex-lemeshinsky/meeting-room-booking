import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() })
}));

afterEach(cleanup);

describe("LoginPage", () => {
  it("explains an expired or invalid session accessibly", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ reason: "session" })
      })
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Сесія завершилася. Увійдіть знову."
    );
  });

  it("does not treat array-shaped reasons as a session redirect", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ reason: ["session"] })
      })
    );

    expect(screen.queryByText("Сесія завершилася. Увійдіть знову.")).toBeNull();
  });
});

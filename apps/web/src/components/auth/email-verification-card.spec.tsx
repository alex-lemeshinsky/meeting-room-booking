import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailVerificationCard } from "./email-verification-card";

const validToken = "A".repeat(43);
let token: string | null = validToken;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => token })
}));

afterEach(() => {
  cleanup();
  token = validToken;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EmailVerificationCard", () => {
  it("renders a valid link without submitting it", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailVerificationCard />);

    expect(
      screen.getByText("Підтвердьте email, щоб створювати бронювання.")
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Підтвердити email" })
    ).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, "not-a-token"])(
    "shows an invalid-link result for %s without a submit action",
    (invalidToken) => {
      token = invalidToken;
      render(<EmailVerificationCard />);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Посилання для підтвердження недійсне."
      );
      expect(
        screen.queryByRole("button", { name: "Підтвердити email" })
      ).toBeNull();
    }
  );

  it("scrubs the URL before posting the token and shows pending state", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmailVerificationCard />);

    await user.click(screen.getByRole("button", { name: "Підтвердити email" }));

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/verify-email"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: validToken })
    });
    expect(
      screen.getByRole("button", { name: "Підтверджуємо…" })
    ).toBeDisabled();

    resolveRequest?.({
      ok: true,
      json: async () => ({ verified: true })
    } as Response);
  });

  it("focuses and announces success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ verified: true })
      } as Response)
    );
    const user = userEvent.setup();
    render(<EmailVerificationCard />);

    await user.click(screen.getByRole("button", { name: "Підтвердити email" }));

    const heading = await screen.findByRole("heading", {
      name: "Email підтверджено"
    });
    expect(heading).toHaveFocus();
    expect(heading.parentElement).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Увійти" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it.each([
    ["EMAIL_VERIFICATION_TOKEN_EXPIRED", "Термін дії посилання минув."],
    ["EMAIL_VERIFICATION_TOKEN_USED", "Це посилання вже використано."],
    [
      "EMAIL_VERIFICATION_TOKEN_INVALID",
      "Посилання для підтвердження недійсне."
    ]
  ])("maps %s to approved copy", async (code, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiError(code)));
    const user = userEvent.setup();
    render(<EmailVerificationCard />);

    await user.click(screen.getByRole("button", { name: "Підтвердити email" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
  });

  it("reuses the scrubbed in-memory token only after an unexpected error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError("HTTP_ERROR"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true })
      } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<EmailVerificationCard />);

    await user.click(screen.getByRole("button", { name: "Підтвердити email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося підтвердити email. Спробуйте ще раз."
    );
    expect(
      screen.getByRole("button", { name: "Спробувати ще раз" })
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Спробувати ще раз" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/v1/auth/verify-email",
      expect.objectContaining({ body: JSON.stringify({ token: validToken }) })
    ]);
  });
});

function apiError(code: string): Response {
  return {
    ok: false,
    json: async () => ({
      error: {
        code,
        message: "Request failed",
        requestId: "request-123"
      }
    })
  } as Response;
}

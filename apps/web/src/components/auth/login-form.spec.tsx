import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const router = {
  replace: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

function apiError(code: string, fields: Record<string, string[]> = {}) {
  return {
    ok: false,
    json: async () => ({
      error: {
        code,
        message: "Request failed",
        fields,
        requestId: "request-123"
      }
    })
  } as Response;
}

function apiSuccess() {
  return {
    ok: true,
    json: async () => ({
      user: { id: "user-123", name: "Олена", email: "olena@example.com" }
    })
  } as Response;
}

afterEach(() => {
  cleanup();
  router.replace.mockReset();
  router.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("shows successful registration copy when registered=1", () => {
    render(<LoginForm registered />);

    expect(
      screen.getByText("Обліковий запис створено. Тепер увійдіть.")
    ).toBeVisible();
  });

  it("shows one generic message and keeps the email for invalid credentials", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("INVALID_CREDENTIALS"))
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Невірний email або пароль."
    );
    expect(screen.getAllByText("Невірний email або пароль.")).toHaveLength(1);
    expect(screen.getByLabelText("Email")).toHaveValue("olena@example.com");
  });

  it("associates server validation errors with the affected login field", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          apiError("VALIDATION_ERROR", { email: ["Вкажіть коректний email."] })
        )
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "invalid");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect(await screen.findByText("Вкажіть коректний email.")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-describedby",
      "login-email-error"
    );
  });

  it("disables only the submit button while the login request is pending", async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect(screen.getByRole("button", { name: "Вхід…" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).not.toBeDisabled();
    expect(screen.getByLabelText("Пароль")).not.toBeDisabled();

    resolveRequest?.(apiSuccess());
  });

  it("redirects to rooms and refreshes after a successful login", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiSuccess()));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Увійти" }));

    expect(router.replace).toHaveBeenCalledWith("/rooms");
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});

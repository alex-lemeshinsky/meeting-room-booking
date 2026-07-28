import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";

const router = {
  replace: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

function apiError(code: string, fields: unknown = {}) {
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

describe("RegisterForm", () => {
  it("marks every registration field as required", () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText("Ім’я")).toBeRequired();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText("Пароль")).toBeRequired();
  });

  it("focuses the first invalid field after a blank submission", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(
      screen.getByRole("button", { name: "Створити обліковий запис" })
    );

    expect(screen.getByLabelText("Ім’я")).toHaveFocus();
  });

  it("keeps the email and shows its server error when it is already registered", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        apiError("EMAIL_ALREADY_REGISTERED", {
          email: ["Обліковий запис із цим email уже існує"]
        })
      )
    );
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Ім’я"), "Олена");
    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(
      screen.getByRole("button", { name: "Створити обліковий запис" })
    );

    expect(
      await screen.findByText("Обліковий запис із цим email уже існує")
    ).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("olena@example.com");
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("falls back to a general error when server field errors are malformed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(apiError("VALIDATION_ERROR", { email: "invalid" }))
    );
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Ім’я"), "Олена");
    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(
      screen.getByRole("button", { name: "Створити обліковий запис" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося створити обліковий запис. Спробуйте ще раз."
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("falls back to a general error when the server fields container is an array", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("VALIDATION_ERROR", [["invalid"]]))
    );
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Ім’я"), "Олена");
    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(
      screen.getByRole("button", { name: "Створити обліковий запис" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося створити обліковий запис. Спробуйте ще раз."
    );
  });

  it("redirects to login after a successful registration", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(apiSuccess());
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Ім’я"), "Олена");
    await user.type(screen.getByLabelText("Email"), "olena@example.com");
    await user.type(screen.getByLabelText("Пароль"), "secret-password");
    await user.click(
      screen.getByRole("button", { name: "Створити обліковий запис" })
    );

    expect(router.replace).toHaveBeenCalledWith("/login?registered=1");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Олена",
        email: "olena@example.com",
        password: "secret-password"
      })
    });
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).headers
    ).not.toHaveProperty("Origin");
  });
});

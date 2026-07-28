import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./logout-button";

const router = {
  replace: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

afterEach(() => {
  cleanup();
  document.cookie = "mrb_csrf=; Max-Age=0; path=/";
  router.replace.mockReset();
  router.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("LogoutButton", () => {
  it("sends the CSRF cookie and redirects after a successful logout", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "mrb_csrf=csrf-value; path=/";
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "Вийти" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-value"
        }),
        body: "{}"
      })
    );
    expect(router.replace).toHaveBeenCalledWith("/login?loggedOut=1");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the user in context and offers a retry after failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false } as Response)
    );
    render(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "Вийти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося вийти. Спробуйте ще раз."
    );
    expect(screen.getByRole("button", { name: "Вийти" })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

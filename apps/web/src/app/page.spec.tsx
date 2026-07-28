import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieStore, cookies, redirect } = vi.hoisted(() => ({
  cookieStore: { has: vi.fn() },
  cookies: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));

import HomePage from "./page";

afterEach(() => {
  cookieStore.has.mockReset();
  cookies.mockReset();
  redirect.mockReset();
});

describe("HomePage", () => {
  it("redirects users with the session cookie to rooms", async () => {
    cookieStore.has.mockReturnValue(true);
    cookies.mockResolvedValue(cookieStore);

    await HomePage();

    expect(cookieStore.has).toHaveBeenCalledWith("mrb_session");
    expect(redirect).toHaveBeenCalledWith("/rooms");
  });

  it("redirects users without the session cookie to login", async () => {
    cookieStore.has.mockReturnValue(false);
    cookies.mockResolvedValue(cookieStore);

    await HomePage();

    expect(cookieStore.has).toHaveBeenCalledWith("mrb_session");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

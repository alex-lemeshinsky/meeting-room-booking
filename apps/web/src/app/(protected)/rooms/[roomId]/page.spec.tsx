import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/shell/toast-provider";

const {
  cookieStore,
  cookies,
  getCurrentSession,
  getRoom,
  notFound,
  redirect,
  UnauthenticatedError
} = vi.hoisted(() => {
  class TestUnauthenticatedError extends Error {}

  return {
    cookieStore: { get: vi.fn() },
    cookies: vi.fn(),
    getCurrentSession: vi.fn(),
    getRoom: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirect: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    UnauthenticatedError: TestUnauthenticatedError
  };
});

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({
  notFound,
  redirect,
  usePathname: () => "/rooms/room-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));
vi.mock("../../../../lib/auth/session", () => ({ getCurrentSession, getRoom }));
vi.mock("../../../../lib/api/server", () => ({ UnauthenticatedError }));

import SchedulePage, {
  normalizeScheduleWeek,
  normalizeTimezoneCookie
} from "./page";

const room = {
  id: "room-1",
  name: "Дніпро",
  floor: 4,
  // A "few" capacity: the earlier two-form label rendered this as "4 місць".
  capacity: 4
};

afterEach(() => {
  cleanup();
  cookieStore.get.mockReset();
  cookies.mockReset();
  getCurrentSession.mockReset();
  getRoom.mockReset();
  notFound.mockClear();
  redirect.mockClear();
  vi.unstubAllGlobals();
});

describe("room schedule route", () => {
  it("renders the selected room context and calendar loading geometry", async () => {
    getRoom.mockResolvedValue(room);
    getCurrentSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Тест",
        email: "test@example.com",
        weekStartsOn: 1
      }
    });
    cookieStore.get.mockReturnValue(undefined);
    cookies.mockResolvedValue(cookieStore);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {await SchedulePage({
            params: Promise.resolve({ roomId: "room-1" }),
            searchParams: Promise.resolve({ week: "2026-07-27" })
          })}
        </ToastProvider>
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Розклад кімнати Дніпро" })
    ).toBeVisible();
    expect(screen.getByText("4 поверх")).toBeVisible();
    expect(screen.getByText("4 місця")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "До списку кімнат" })
    ).toHaveAttribute("href", "/rooms");
    expect(screen.getByLabelText("Завантажуємо розклад")).toBeVisible();
  });

  it("returns the room not-found boundary when the room does not exist", async () => {
    getRoom.mockResolvedValue(undefined);

    await expect(
      SchedulePage({
        params: Promise.resolve({ roomId: "missing" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects an unauthenticated room lookup to the session login", async () => {
    getRoom.mockRejectedValue(new UnauthenticatedError());

    await expect(
      SchedulePage({
        params: Promise.resolve({ roomId: "room-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?reason=session");
  });
});

describe("normalizeScheduleWeek", () => {
  it("returns the week start unchanged when it already matches the anchor", () => {
    expect(normalizeScheduleWeek("2026-07-27", 1)).toBe("2026-07-27");
  });

  it("snaps a mid-week date to the containing week", () => {
    expect(normalizeScheduleWeek("2026-07-29", 1)).toBe("2026-07-27");
  });

  it("snaps a Monday link for a Sunday-anchored viewer", () => {
    expect(normalizeScheduleWeek("2026-08-03", 7)).toBe("2026-08-02");
  });

  it("ignores absent, repeated, and malformed values", () => {
    expect(normalizeScheduleWeek(undefined, 1)).toBeUndefined();
    expect(normalizeScheduleWeek(["2026-07-27"], 1)).toBeUndefined();
    expect(normalizeScheduleWeek("2026-02-30", 1)).toBeUndefined();
    expect(normalizeScheduleWeek("not-a-date", 1)).toBeUndefined();
  });
});

describe("schedule route state normalization", () => {
  it("accepts only valid IANA timezone cookies", () => {
    expect(normalizeTimezoneCookie("America/New_York")).toBe(
      "America/New_York"
    );
    expect(normalizeTimezoneCookie("+02:00")).toBeUndefined();
    expect(normalizeTimezoneCookie("Unknown/Zone")).toBeUndefined();
    expect(normalizeTimezoneCookie(undefined)).toBeUndefined();
  });
});

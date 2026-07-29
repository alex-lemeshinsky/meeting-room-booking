import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  cookieStore,
  cookies,
  getRoom,
  notFound,
  redirect,
  UnauthenticatedError
} = vi.hoisted(() => {
  class TestUnauthenticatedError extends Error {}

  return {
    cookieStore: { get: vi.fn() },
    cookies: vi.fn(),
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
vi.mock("../../../../lib/auth/session", () => ({ getRoom }));
vi.mock("../../../../lib/api/server", () => ({ UnauthenticatedError }));

import SchedulePage, {
  normalizeScheduleWeek,
  normalizeTimezoneCookie
} from "./page";

const room = {
  id: "room-1",
  name: "Дніпро",
  floor: 4,
  capacity: 10
};

afterEach(() => {
  cleanup();
  cookieStore.get.mockReset();
  cookies.mockReset();
  getRoom.mockReset();
  notFound.mockClear();
  redirect.mockClear();
  vi.unstubAllGlobals();
});

describe("room schedule route", () => {
  it("renders the selected room context and calendar loading geometry", async () => {
    getRoom.mockResolvedValue(room);
    cookieStore.get.mockReturnValue(undefined);
    cookies.mockResolvedValue(cookieStore);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        {await SchedulePage({
          params: Promise.resolve({ roomId: "room-1" }),
          searchParams: Promise.resolve({ week: "2026-07-27" })
        })}
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Розклад кімнати Дніпро" })
    ).toBeVisible();
    expect(screen.getByText("4 поверх")).toBeVisible();
    expect(screen.getByText("10 місць")).toBeVisible();
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

describe("schedule route state normalization", () => {
  it("accepts only a single valid Monday as the authoritative week", () => {
    expect(normalizeScheduleWeek("2026-07-27")).toBe("2026-07-27");
    expect(normalizeScheduleWeek("2026-07-28")).toBeUndefined();
    expect(normalizeScheduleWeek("not-a-date")).toBeUndefined();
    expect(normalizeScheduleWeek(["2026-07-27"])).toBeUndefined();
    expect(normalizeScheduleWeek(undefined)).toBeUndefined();
  });

  it("accepts only valid IANA timezone cookies", () => {
    expect(normalizeTimezoneCookie("America/New_York")).toBe(
      "America/New_York"
    );
    expect(normalizeTimezoneCookie("+02:00")).toBeUndefined();
    expect(normalizeTimezoneCookie("Unknown/Zone")).toBeUndefined();
    expect(normalizeTimezoneCookie(undefined)).toBeUndefined();
  });
});

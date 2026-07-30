import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieStore, cookies, getMyBookings, redirect, UnauthenticatedError } =
  vi.hoisted(() => {
    class TestUnauthenticatedError extends Error {}

    return {
      cookieStore: { get: vi.fn() },
      cookies: vi.fn(),
      getMyBookings: vi.fn(),
      redirect: vi.fn(() => {
        throw new Error("NEXT_REDIRECT");
      }),
      UnauthenticatedError: TestUnauthenticatedError
    };
  });

vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../lib/auth/session", () => ({ getMyBookings }));
vi.mock("../../../lib/api/server", () => ({ UnauthenticatedError }));

import MyBookingsRoute from "./page";

afterEach(() => {
  cleanup();
  cookieStore.get.mockReset();
  cookies.mockReset();
  getMyBookings.mockReset();
  redirect.mockClear();
});

describe("My Bookings route", () => {
  it("renders the server-fetched upcoming snapshot", async () => {
    getMyBookings.mockResolvedValue({
      bookings: [
        {
          id: "booking-1",
          room: { id: "room-1", name: "Арсенал" },
          title: "Командне планування",
          startAt: "2026-07-27T06:00:00.000Z",
          endAt: "2026-07-27T06:30:00.000Z",
          state: "UPCOMING"
        }
      ],
      nextCursor: null
    });
    cookieStore.get.mockReturnValue({ value: "Europe/Kyiv" });
    cookies.mockResolvedValue(cookieStore);

    render(
      <QueryClientProvider client={new QueryClient()}>
        {await MyBookingsRoute()}
      </QueryClientProvider>
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Мої бронювання" })
    ).toBeVisible();
    expect(screen.getByText("Командне планування")).toBeVisible();
  });

  it("redirects an unauthenticated query to login", async () => {
    getMyBookings.mockRejectedValue(new UnauthenticatedError());

    await expect(MyBookingsRoute()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?reason=session");
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getRooms, redirect, UnauthenticatedError } = vi.hoisted(() => {
  class TestUnauthenticatedError extends Error {}

  return {
    getRooms: vi.fn(),
    redirect: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    UnauthenticatedError: TestUnauthenticatedError
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../lib/auth/session", () => ({ getRooms }));
vi.mock("../../../lib/api/server", () => ({ UnauthenticatedError }));

import RoomsPage from "./page";

const rooms = [
  { id: "room-1", name: "Обрій", floor: 2, capacity: 10 },
  { id: "room-2", name: "Поділ", floor: 3, capacity: 12 }
];

afterEach(() => {
  cleanup();
  getRooms.mockReset();
  redirect.mockClear();
});

describe("rooms route", () => {
  it("fetches all rooms when the filter is absent", async () => {
    getRooms.mockResolvedValue({ rooms });

    render(
      await RoomsPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(getRooms).toHaveBeenCalledWith(undefined);
    expect(
      screen.getByRole("spinbutton", { name: "Мінімальна місткість" })
    ).toHaveValue(null);
  });

  it("passes a valid URL filter to the API and preserves it in the field", async () => {
    getRooms.mockResolvedValue({ rooms: [rooms[1]] });

    render(
      await RoomsPage({
        searchParams: Promise.resolve({ minCapacity: "12" })
      })
    );

    expect(getRooms).toHaveBeenCalledWith(12);
    expect(
      screen.getByRole("spinbutton", { name: "Мінімальна місткість" })
    ).toHaveValue(12);
    expect(screen.getByRole("heading", { name: "Поділ" })).toBeVisible();
  });

  it("keeps malformed URL state recoverable without sending it to the API", async () => {
    getRooms.mockResolvedValue({ rooms });

    render(
      await RoomsPage({
        searchParams: Promise.resolve({ minCapacity: "six" })
      })
    );

    expect(getRooms).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Введіть ціле число від 1."
    );
    expect(screen.getByRole("heading", { name: "Обрій" })).toBeVisible();
  });

  it("redirects an unauthenticated query to login", async () => {
    getRooms.mockRejectedValue(new UnauthenticatedError());

    await expect(
      RoomsPage({ searchParams: Promise.resolve({ minCapacity: "10" }) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?reason=session");
  });
});

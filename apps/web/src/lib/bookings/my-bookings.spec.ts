import { describe, expect, it } from "vitest";
import type { MyBookingsResponse } from "../api/contracts";
import {
  bookingCalendarHref,
  formatMyBookingInterval,
  myBookingStateLabel
} from "./my-bookings";

const booking: MyBookingsResponse["bookings"][number] = {
  id: "20000000-0000-4000-8000-000000000001",
  room: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Арсенал"
  },
  title: "Командне планування",
  startAt: "2026-07-27T03:30:00.000Z",
  endAt: "2026-07-27T04:30:00.000Z",
  state: "UPCOMING",
  seriesId: null,
  occurrenceIndex: null,
  occurrenceCount: null
};

describe("My Bookings display model", () => {
  it("builds a schedule link for the booking's local week with weekStartsOn", () => {
    expect(bookingCalendarHref(booking, "America/New_York", 1)).toBe(
      "/rooms/10000000-0000-4000-8000-000000000001?week=2026-07-20"
    );
    expect(bookingCalendarHref(booking, "Europe/Kyiv", 1)).toBe(
      "/rooms/10000000-0000-4000-8000-000000000001?week=2026-07-27"
    );
    expect(bookingCalendarHref(booking, "Europe/Kyiv", 7)).toBe(
      "/rooms/10000000-0000-4000-8000-000000000001?week=2026-07-26"
    );
  });

  it("formats intervals in the browser timezone including midnight crossing", () => {
    expect(formatMyBookingInterval(booking, "America/New_York")).toBe(
      "26.07.2026, 23:30 – 27.07.2026, 00:30"
    );
  });

  it.each([
    ["ACTIVE", "Триває зараз"],
    ["UPCOMING", "Майбутнє"],
    ["COMPLETED", "Завершено"],
    ["CANCELLED", "Скасовано"]
  ] as const)("labels %s as %s", (state, label) => {
    expect(myBookingStateLabel(state)).toBe(label);
  });
});

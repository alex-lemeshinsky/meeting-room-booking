import { describe, expect, it } from "vitest";
import type { ScheduleResponse } from "../api/contracts";
import { buildBookingEndOptions, formatBookingInterval } from "./booking";

describe("booking form time options", () => {
  it("offers adjacent 30-minute ends only until the next booking", () => {
    expect(
      buildBookingEndOptions(
        "2026-07-27T06:30:00.000Z",
        [booking("2026-07-27T08:00:00.000Z", "2026-07-27T09:00:00.000Z")],
        "Europe/Kyiv"
      )
    ).toEqual([
      { value: "2026-07-27T07:00:00.000Z", label: "10:00" },
      { value: "2026-07-27T07:30:00.000Z", label: "10:30" },
      { value: "2026-07-27T08:00:00.000Z", label: "11:00" }
    ]);
  });

  it("caps the interval at four hours and the concrete Kyiv office end", () => {
    expect(
      buildBookingEndOptions("2026-07-27T14:30:00.000Z", [], "Europe/Kyiv")
    ).toEqual([
      { value: "2026-07-27T15:00:00.000Z", label: "18:00" },
      { value: "2026-07-27T15:30:00.000Z", label: "18:30" },
      { value: "2026-07-27T16:00:00.000Z", label: "19:00" }
    ]);
  });

  it("formats end instants in the browser timezone", () => {
    expect(
      buildBookingEndOptions(
        "2026-07-27T06:00:00.000Z",
        [],
        "Asia/Kathmandu"
      ).slice(0, 2)
    ).toEqual([
      { value: "2026-07-27T06:30:00.000Z", label: "12:15" },
      { value: "2026-07-27T07:00:00.000Z", label: "12:45" }
    ]);
  });
});

describe("formatBookingInterval", () => {
  it("shows one local date for a same-day interval", () => {
    expect(
      formatBookingInterval(
        "2026-07-27T06:30:00.000Z",
        "2026-07-27T07:00:00.000Z",
        "Asia/Kathmandu"
      )
    ).toBe("27.07.2026, 12:15–12:45");
  });

  it("shows both local dates when the interval crosses midnight", () => {
    expect(
      formatBookingInterval(
        "2026-07-27T03:30:00.000Z",
        "2026-07-27T04:30:00.000Z",
        "America/New_York"
      )
    ).toBe("26.07.2026, 23:30 – 27.07.2026, 00:30");
  });
});

function booking(
  startAt: string,
  endAt: string
): ScheduleResponse["bookings"][number] {
  return {
    id: `${startAt}-${endAt}`,
    title: "Зайнято",
    startAt,
    endAt,
    organizer: { id: "user-1", name: "Олена" },
    isOwn: false,
    seriesId: null,
    occurrenceIndex: null,
    occurrenceCount: null
  };
}

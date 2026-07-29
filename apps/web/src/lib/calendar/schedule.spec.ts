import { describe, expect, it } from "vitest";
import type { ScheduleResponse } from "../api/contracts";
import { buildCalendarLayout, createScheduleRequest } from "./schedule";

const room = {
  id: "room-1",
  name: "Дніпро",
  floor: 4,
  capacity: 10
};

function scheduleResponse(
  bookings: ScheduleResponse["bookings"] = []
): ScheduleResponse {
  return {
    room,
    from: "2026-07-26T21:00:00.000Z",
    to: "2026-08-02T21:00:00.000Z",
    bookings
  };
}

describe("schedule request", () => {
  it("uses the room, local week, and timezone in the key and UTC URL", () => {
    expect(
      createScheduleRequest("room/one", "2026-07-27", "America/New_York")
    ).toEqual({
      queryKey: ["schedule", "room/one", "2026-07-27", "America/New_York"],
      from: "2026-07-27T04:00:00.000Z",
      to: "2026-08-03T04:00:00.000Z",
      url:
        "/api/v1/rooms/room%2Fone/schedule" +
        "?from=2026-07-27T04%3A00%3A00.000Z" +
        "&to=2026-08-03T04%3A00%3A00.000Z"
    });
  });
});

describe("calendar layout", () => {
  it("builds seven complete columns over the compact Kyiv office range", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-07-27",
      timezone: "Europe/Kyiv",
      now: new Date("2026-07-29T07:15:00.000Z")
    });

    expect(layout.range).toEqual({
      startMinute: 540,
      endMinute: 1140,
      isFullDay: false
    });
    expect(layout.days).toHaveLength(7);
    expect(layout.days.every((day) => day.slots.length === 20)).toBe(true);
  });

  it("expands to 24 hours when a Kyiv office interval crosses local midnight", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-07-27",
      timezone: "America/Los_Angeles",
      now: new Date("2026-07-29T12:00:00.000Z")
    });

    expect(layout.range).toEqual({
      startMinute: 0,
      endMinute: 1440,
      isFullDay: true
    });
    expect(
      layout.days.some((day) => day.slots.some((slot) => !slot.isOffice))
    ).toBe(true);
  });

  it("omits spring-gap slots and keeps fold slots distinct with offset labels", () => {
    const spring = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-03-02",
      timezone: "America/Los_Angeles",
      now: new Date("2026-03-02T12:00:00.000Z")
    });
    const springSunday = spring.days.find(
      (day) => day.localDate === "2026-03-08"
    );

    expect(springSunday?.slots.map((slot) => slot.minuteOfDay)).not.toContain(
      120
    );
    expect(springSunday?.slots.map((slot) => slot.minuteOfDay)).not.toContain(
      150
    );

    const autumn = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });
    const autumnSunday = autumn.days.find(
      (day) => day.localDate === "2026-11-01"
    );
    const repeated = autumnSunday?.slots.filter(
      (slot) => slot.minuteOfDay === 60
    );

    expect(repeated).toHaveLength(2);
    expect(repeated?.map((slot) => slot.id)).toEqual([
      "2026-11-01T08:00:00.000Z",
      "2026-11-01T09:00:00.000Z"
    ]);
    expect(repeated?.map((slot) => slot.offsetLabel)).toEqual([
      "UTC-07:00",
      "UTC-08:00"
    ]);
  });

  it("splits a midnight booking into linked non-empty visible fragments", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-night",
          title: "Нічна синхронізація",
          startAt: "2026-07-28T06:30:00.000Z",
          endAt: "2026-07-28T09:00:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        }
      ]),
      weekStart: "2026-07-27",
      timezone: "America/Los_Angeles",
      now: new Date("2026-07-29T12:00:00.000Z")
    });

    expect(
      layout.bookings.map(
        ({ bookingId, localDate, startMinute, endMinute }) => ({
          bookingId,
          localDate,
          startMinute,
          endMinute
        })
      )
    ).toEqual([
      {
        bookingId: "booking-night",
        localDate: "2026-07-27",
        startMinute: 1410,
        endMinute: 1440
      },
      {
        bookingId: "booking-night",
        localDate: "2026-07-28",
        startMinute: 0,
        endMinute: 120
      }
    ]);
  });

  it("projects ownership, title, organizer, current day, and current instant", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-own",
          title: "Планування",
          startAt: "2026-07-29T07:00:00.000Z",
          endAt: "2026-07-29T08:00:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        },
        {
          id: "booking-other",
          title: "Демо",
          startAt: "2026-07-30T08:00:00.000Z",
          endAt: "2026-07-30T09:00:00.000Z",
          organizer: { id: "user-2", name: "Тарас" },
          isOwn: false
        }
      ]),
      weekStart: "2026-07-27",
      timezone: "Europe/Kyiv",
      now: new Date("2026-07-29T07:15:00.000Z")
    });

    expect(layout.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: "booking-own",
          title: "Планування",
          organizerName: "Олена",
          isOwn: true
        }),
        expect.objectContaining({
          bookingId: "booking-other",
          title: "Демо",
          organizerName: "Тарас",
          isOwn: false
        })
      ])
    );
    expect(
      layout.days.find((day) => day.localDate === "2026-07-29")?.isToday
    ).toBe(true);
    expect(layout.now).toEqual({
      localDate: "2026-07-29",
      slotId: "2026-07-29T07:00:00.000Z",
      offsetPercent: 50
    });
  });
});

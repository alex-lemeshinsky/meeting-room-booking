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
  it("marks only future, free Kyiv-grid starts as bookable", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-blocked",
          title: "Зайнято",
          startAt: "2026-07-27T07:30:00.000Z",
          endAt: "2026-07-27T08:30:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: false
        }
      ]),
      weekStart: "2026-07-27",
      timezone: "Europe/Kyiv",
      now: new Date("2026-07-27T06:15:00.000Z")
    });
    const monday = layout.days[0];

    expect(
      monday?.slots.map((slot) => [slot.instant, slot.bookingStartAt])
    ).toEqual([
      ["2026-07-27T06:00:00.000Z", undefined],
      ["2026-07-27T06:30:00.000Z", "2026-07-27T06:30:00.000Z"],
      ["2026-07-27T07:00:00.000Z", "2026-07-27T07:00:00.000Z"],
      ["2026-07-27T07:30:00.000Z", undefined],
      ["2026-07-27T08:00:00.000Z", undefined],
      ["2026-07-27T08:30:00.000Z", "2026-07-27T08:30:00.000Z"],
      ...(monday?.slots.slice(6) ?? []).map((slot) => [
        slot.instant,
        slot.instant
      ])
    ]);
  });

  it("projects a Kyiv-grid start into a partially offset local slot", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-07-27",
      timezone: "Asia/Kathmandu",
      now: new Date("2026-07-27T05:00:00.000Z")
    });
    const monday = layout.days[0];

    expect(
      monday?.slots.find((slot) => slot.minuteOfDay === 690)
    ).toMatchObject({
      instant: "2026-07-27T05:45:00.000Z",
      officeStartPercent: 50,
      bookingStartAt: "2026-07-27T06:00:00.000Z",
      bookingStartLabel: "11:45"
    });
  });

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

  it("aligns spring-gap slots to explicit shared rows", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-03-02",
      timezone: "America/Los_Angeles",
      now: new Date("2026-03-02T12:00:00.000Z")
    });
    const springSunday = layout.days.find(
      (day) => day.localDate === "2026-03-08"
    );

    expect(layout.rows).toHaveLength(48);
    expect(
      springSunday?.slots.find((slot) => slot.label === "03:00")
    ).toMatchObject({
      rowIndex: 6
    });
  });

  it("adds offset-labelled shared rows for both autumn-fold occurrences", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });
    const autumnSunday = layout.days.find(
      (day) => day.localDate === "2026-11-01"
    );

    expect(layout.rows).toHaveLength(50);
    expect(layout.rows.slice(2, 6)).toEqual([
      {
        id: "60-0",
        label: "01:00",
        minuteOfDay: 60,
        offsetLabel: "UTC-07:00"
      },
      {
        id: "90-0",
        label: "01:30",
        minuteOfDay: 90,
        offsetLabel: "UTC-07:00"
      },
      {
        id: "60-1",
        label: "01:00",
        minuteOfDay: 60,
        offsetLabel: "UTC-08:00"
      },
      {
        id: "90-1",
        label: "01:30",
        minuteOfDay: 90,
        offsetLabel: "UTC-08:00"
      }
    ]);
    expect(
      autumnSunday?.slots.find((slot) => slot.label === "02:00")
    ).toMatchObject({
      rowIndex: 6
    });
  });

  it("keeps a real booking visible when its wall-clock minutes repeat across a fold", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-fold",
          title: "Перехід часу",
          startAt: "2026-11-01T08:30:00.000Z",
          endAt: "2026-11-01T09:30:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        }
      ]),
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });

    expect(layout.bookings).toEqual([
      expect.objectContaining({
        bookingId: "booking-fold",
        localDate: "2026-11-01",
        startMinute: 90,
        endMinute: 90,
        startRowIndex: 3,
        startOffsetPercent: 0,
        heightInRows: 2
      })
    ]);
  });

  it("projects a fold-boundary endpoint from the second occurrence instant", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-fold-boundary",
          title: "Межа переходу",
          startAt: "2026-11-01T08:30:00.000Z",
          endAt: "2026-11-01T09:00:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        }
      ]),
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });

    expect(layout.bookings).toEqual([
      expect.objectContaining({
        bookingId: "booking-fold-boundary",
        startMinute: 90,
        endMinute: 60,
        startRowIndex: 3,
        startOffsetPercent: 0,
        heightInRows: 1,
        accessibleLabel:
          "Межа переходу. неділя, 1 листопада 2026 р., " +
          "01:30 UTC-07:00–01:00 UTC-08:00. Моє"
      })
    ]);
  });

  it("uses fractional instant geometry for quarter-hour bookings and office edges", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-quarter",
          title: "Точна геометрія",
          startAt: "2026-07-27T06:00:00.000Z",
          endAt: "2026-07-27T06:30:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        }
      ]),
      weekStart: "2026-07-27",
      timezone: "Asia/Kathmandu",
      now: new Date("2026-07-27T07:00:00.000Z")
    });
    const monday = layout.days[0];

    expect(layout.range).toEqual({
      startMinute: 690,
      endMinute: 1320,
      isFullDay: false
    });
    expect(
      monday?.slots.find((slot) => slot.minuteOfDay === 690)
    ).toMatchObject({
      officeStartPercent: 50,
      officeEndPercent: 100
    });
    expect(
      monday?.slots.find((slot) => slot.minuteOfDay === 1290)
    ).toMatchObject({
      officeStartPercent: 0,
      officeEndPercent: 50
    });
    expect(layout.bookings).toEqual([
      expect.objectContaining({
        bookingId: "booking-quarter",
        startRowIndex: 0,
        startOffsetPercent: 50,
        heightInRows: 1
      })
    ]);
  });

  it("keeps exact geometry for back-to-back Chatham midnight bookings", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse([
        {
          id: "booking-before-midnight",
          title: "Попередня зустріч",
          startAt: "2026-07-28T10:30:00.000Z",
          endAt: "2026-07-28T11:00:00.000Z",
          organizer: { id: "user-2", name: "Тарас" },
          isOwn: false
        },
        {
          id: "booking-chatham-midnight",
          title: "Північний перехід",
          startAt: "2026-07-28T11:00:00.000Z",
          endAt: "2026-07-28T11:30:00.000Z",
          organizer: { id: "user-1", name: "Олена" },
          isOwn: true
        }
      ]),
      weekStart: "2026-07-27",
      timezone: "Pacific/Chatham",
      now: new Date("2026-07-27T07:00:00.000Z")
    });

    expect(
      layout.bookings.map(
        ({
          bookingId,
          localDate,
          startMinute,
          endMinute,
          continuesBefore,
          continuesAfter,
          startRowIndex,
          startOffsetPercent,
          heightInRows
        }) => ({
          bookingId,
          localDate,
          startMinute,
          endMinute,
          continuesBefore,
          continuesAfter,
          startRowIndex,
          startOffsetPercent,
          heightInRows
        })
      )
    ).toEqual([
      {
        bookingId: "booking-before-midnight",
        localDate: "2026-07-28",
        startMinute: 1395,
        endMinute: 1425,
        continuesBefore: false,
        continuesAfter: false,
        startRowIndex: 46,
        startOffsetPercent: 50,
        heightInRows: 1
      },
      {
        bookingId: "booking-chatham-midnight",
        localDate: "2026-07-28",
        startMinute: 1425,
        endMinute: 1440,
        continuesBefore: false,
        continuesAfter: true,
        startRowIndex: 47,
        startOffsetPercent: 50,
        heightInRows: 0.5
      },
      {
        bookingId: "booking-chatham-midnight",
        localDate: "2026-07-29",
        startMinute: 0,
        endMinute: 15,
        continuesBefore: true,
        continuesAfter: false,
        startRowIndex: 0,
        startOffsetPercent: 0,
        heightInRows: 0.5
      }
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

  it("models full, fractional, and future elapsed coverage only on today", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-07-27",
      timezone: "Europe/Kyiv",
      now: new Date("2026-07-29T07:15:00.000Z")
    });
    const today = layout.days.find((day) => day.localDate === "2026-07-29");
    const tomorrow = layout.days.find((day) => day.localDate === "2026-07-30");

    expect(
      today?.slots
        .filter((slot) => [540, 570, 600, 630].includes(slot.minuteOfDay))
        .map(({ minuteOfDay, elapsedPercent }) => ({
          minuteOfDay,
          elapsedPercent
        }))
    ).toEqual([
      { minuteOfDay: 540, elapsedPercent: 100 },
      { minuteOfDay: 570, elapsedPercent: 100 },
      { minuteOfDay: 600, elapsedPercent: 50 },
      { minuteOfDay: 630, elapsedPercent: 0 }
    ]);
    expect(tomorrow?.slots.every((slot) => slot.elapsedPercent === 0)).toBe(
      true
    );
  });

  it("uses UTC slot identity for elapsed coverage across an autumn fold", () => {
    const layout = buildCalendarLayout({
      response: scheduleResponse(),
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-11-01T09:15:00.000Z")
    });
    const foldDay = layout.days.find((day) => day.localDate === "2026-11-01");

    expect(
      foldDay?.slots
        .filter((slot) => slot.minuteOfDay === 60)
        .map(({ id, elapsedPercent }) => ({ id, elapsedPercent }))
    ).toEqual([
      { id: "2026-11-01T08:00:00.000Z", elapsedPercent: 100 },
      { id: "2026-11-01T09:00:00.000Z", elapsedPercent: 50 }
    ]);
  });
});

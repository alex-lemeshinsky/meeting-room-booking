import { describe, expect, it } from "vitest";
import {
  getCurrentLocalWeekStart,
  getKyivOfficeIntervals,
  getLocalWeek,
  splitBookingIntoLocalFragments
} from "./index.js";

describe("local calendar weeks", () => {
  it("uses the Monday that has already started in Kyiv at the UTC boundary", () => {
    const now = new Date("2026-07-26T21:30:00.000Z");

    expect(getCurrentLocalWeekStart("Europe/Kyiv", now)).toBe("2026-07-27");
    expect(getLocalWeek("2026-07-27", "Europe/Kyiv", now)).toMatchObject({
      from: "2026-07-26T21:00:00.000Z",
      to: "2026-08-02T21:00:00.000Z",
      days: [
        { localDate: "2026-07-27", isToday: true },
        { localDate: "2026-07-28", isToday: false },
        { localDate: "2026-07-29", isToday: false },
        { localDate: "2026-07-30", isToday: false },
        { localDate: "2026-07-31", isToday: false },
        { localDate: "2026-08-01", isToday: false },
        { localDate: "2026-08-02", isToday: false }
      ]
    });
  });

  it("uses the previous Monday while New York is still on Sunday", () => {
    const now = new Date("2026-07-27T03:30:00.000Z");

    expect(getCurrentLocalWeekStart("America/New_York", now)).toBe(
      "2026-07-20"
    );
    expect(getLocalWeek("2026-07-27", "America/New_York", now)).toMatchObject({
      from: "2026-07-27T04:00:00.000Z",
      to: "2026-08-03T04:00:00.000Z"
    });
  });

  it("omits nonexistent spring-forward slots", () => {
    const week = getLocalWeek(
      "2026-03-02",
      "America/New_York",
      new Date("2026-03-02T12:00:00.000Z")
    );
    const transitionDay = week.days[6];

    expect(transitionDay?.localDate).toBe("2026-03-08");
    expect(transitionDay?.slots).toHaveLength(46);
    expect(transitionDay?.slots.map((slot) => slot.label)).not.toContain(
      "02:00"
    );
    expect(transitionDay?.slots.map((slot) => slot.label)).not.toContain(
      "02:30"
    );
  });

  it("does not leak the next date into a day whose DST gap starts at midnight", () => {
    const week = getLocalWeek(
      "2026-08-31",
      "America/Santiago",
      new Date("2026-08-31T12:00:00.000Z")
    );
    const transitionDay = week.days[6];

    expect(transitionDay?.localDate).toBe("2026-09-06");
    expect(transitionDay?.slots).toHaveLength(46);
    expect(transitionDay?.slots.map((slot) => slot.localDate)).not.toContain(
      "2026-09-07"
    );
    expect(transitionDay?.slots.map((slot) => slot.label)).not.toContain(
      "00:00"
    );
    expect(transitionDay?.slots.map((slot) => slot.label)).not.toContain(
      "00:30"
    );
  });

  it("keeps repeated autumn slots distinct by UTC identity and offset", () => {
    const week = getLocalWeek(
      "2026-10-26",
      "America/New_York",
      new Date("2026-10-26T12:00:00.000Z")
    );
    const transitionDay = week.days[6];
    const repeatedSlots = transitionDay?.slots.filter(
      (slot) => slot.label === "01:00"
    );

    expect(transitionDay?.localDate).toBe("2026-11-01");
    expect(transitionDay?.slots).toHaveLength(50);
    expect(repeatedSlots).toEqual([
      {
        id: "2026-11-01T05:00:00.000Z",
        instant: "2026-11-01T05:00:00.000Z",
        localDate: "2026-11-01",
        label: "01:00",
        offsetLabel: "UTC-04:00"
      },
      {
        id: "2026-11-01T06:00:00.000Z",
        instant: "2026-11-01T06:00:00.000Z",
        localDate: "2026-11-01",
        label: "01:00",
        offsetLabel: "UTC-05:00"
      }
    ]);
  });
});

describe("Kyiv office intervals", () => {
  it("converts each 09:00-19:00 office day through the Kyiv DST change", () => {
    expect(
      getKyivOfficeIntervals(
        "2026-03-27T22:00:00.000Z",
        "2026-03-29T22:00:00.000Z"
      )
    ).toEqual([
      {
        officeDate: "2026-03-28",
        start: "2026-03-28T07:00:00.000Z",
        end: "2026-03-28T17:00:00.000Z"
      },
      {
        officeDate: "2026-03-29",
        start: "2026-03-29T06:00:00.000Z",
        end: "2026-03-29T16:00:00.000Z"
      }
    ]);
  });

  it("uses half-open overlap when the query touches an office boundary", () => {
    expect(
      getKyivOfficeIntervals(
        "2026-07-27T16:00:00.000Z",
        "2026-07-28T06:00:00.000Z"
      )
    ).toEqual([]);
  });
});

describe("local booking fragments", () => {
  it("splits a booking at local midnight and links both fragments", () => {
    expect(
      splitBookingIntoLocalFragments(
        "booking-1",
        "2026-07-28T03:30:00.000Z",
        "2026-07-28T05:00:00.000Z",
        "America/New_York"
      )
    ).toEqual([
      {
        bookingId: "booking-1",
        localDate: "2026-07-27",
        startMinute: 1410,
        endMinute: 1440,
        continuesBefore: false,
        continuesAfter: true
      },
      {
        bookingId: "booking-1",
        localDate: "2026-07-28",
        startMinute: 0,
        endMinute: 60,
        continuesBefore: true,
        continuesAfter: false
      }
    ]);
  });

  it("does not create an empty fragment when a booking ends at midnight", () => {
    expect(
      splitBookingIntoLocalFragments(
        "booking-2",
        "2026-07-28T02:00:00.000Z",
        "2026-07-28T04:00:00.000Z",
        "America/New_York"
      )
    ).toEqual([
      {
        bookingId: "booking-2",
        localDate: "2026-07-27",
        startMinute: 1320,
        endMinute: 1440,
        continuesBefore: false,
        continuesAfter: false
      }
    ]);
  });

  it("splits at midnight after a date whose DST gap starts at midnight", () => {
    expect(
      splitBookingIntoLocalFragments(
        "booking-3",
        "2026-09-07T02:30:00.000Z",
        "2026-09-07T03:30:00.000Z",
        "America/Santiago"
      )
    ).toEqual([
      {
        bookingId: "booking-3",
        localDate: "2026-09-06",
        startMinute: 1410,
        endMinute: 1440,
        continuesBefore: false,
        continuesAfter: true
      },
      {
        bookingId: "booking-3",
        localDate: "2026-09-07",
        startMinute: 0,
        endMinute: 30,
        continuesBefore: true,
        continuesAfter: false
      }
    ]);
  });
});

describe("calendar input validation", () => {
  it("rejects invalid IANA zones", () => {
    expect(() => getCurrentLocalWeekStart("Not/A_Zone", new Date())).toThrow(
      /timezone/i
    );
    expect(() =>
      splitBookingIntoLocalFragments(
        "booking-1",
        "2026-07-27T10:00:00.000Z",
        "2026-07-27T10:30:00.000Z",
        "Not/A_Zone"
      )
    ).toThrow(/timezone/i);
  });

  it.each(["+02:00", "-05:30"])(
    "rejects the fixed-offset zone identifier %s",
    (timezone) => {
      expect(() =>
        getCurrentLocalWeekStart(timezone, new Date("2026-07-27T10:00:00.000Z"))
      ).toThrow(/timezone/i);
    }
  );

  it("rejects invalid local dates and non-Monday week starts", () => {
    expect(() => getLocalWeek("2026-02-30", "Europe/Kyiv")).toThrow(
      /weekStart/i
    );
    expect(() => getLocalWeek("2026-07-28", "Europe/Kyiv")).toThrow(/Monday/i);
  });

  it("rejects invalid and empty office ranges", () => {
    expect(() =>
      getKyivOfficeIntervals("not-an-instant", "2026-07-27T10:00:00.000Z")
    ).toThrow(/from/i);
    expect(() =>
      getKyivOfficeIntervals(
        "2026-07-27T10:00:00.000Z",
        "2026-07-27T10:00:00.000Z"
      )
    ).toThrow(/from.*to/i);
  });

  it("rejects invalid, empty, and inverted booking intervals", () => {
    expect(() =>
      splitBookingIntoLocalFragments(
        "booking-1",
        "not-an-instant",
        "2026-07-27T10:30:00.000Z",
        "Europe/Kyiv"
      )
    ).toThrow(/startAt/i);
    expect(() =>
      splitBookingIntoLocalFragments(
        "booking-1",
        "2026-07-27T10:30:00.000Z",
        "2026-07-27T10:30:00.000Z",
        "Europe/Kyiv"
      )
    ).toThrow(/startAt.*endAt/i);
    expect(() =>
      splitBookingIntoLocalFragments(
        "booking-1",
        "2026-07-27T11:00:00.000Z",
        "2026-07-27T10:30:00.000Z",
        "Europe/Kyiv"
      )
    ).toThrow(/startAt.*endAt/i);
  });
});

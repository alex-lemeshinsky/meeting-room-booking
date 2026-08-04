import { describe, expect, it } from "vitest";
import {
  getCurrentLocalWeekStart,
  getKyivOfficeIntervals,
  getLocalWeek,
  isValidTimezone,
  shiftLocalWeekStart,
  snapToLocalWeekStart,
  splitBookingIntoLocalFragments
} from "./index.js";

describe("local calendar weeks", () => {
  it("uses the Monday that has already started in Kyiv at the UTC boundary", () => {
    const now = new Date("2026-07-26T21:30:00.000Z");

    expect(getCurrentLocalWeekStart("Europe/Kyiv", 1, now)).toBe("2026-07-27");
    expect(getLocalWeek("2026-07-27", "Europe/Kyiv", 1, now)).toMatchObject({
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

  it("formats Ukrainian day headings and full dates", () => {
    const week = getLocalWeek(
      "2026-07-27",
      "Europe/Kyiv",
      1,
      new Date("2026-07-29T07:15:00.000Z")
    );

    expect(week.days[2]).toMatchObject({
      localDate: "2026-07-29",
      label: "ср, 29 лип.",
      fullDateLabel: "середа, 29 липня 2026 р."
    });
  });

  it("uses the previous Monday while New York is still on Sunday", () => {
    const now = new Date("2026-07-27T03:30:00.000Z");

    expect(getCurrentLocalWeekStart("America/New_York", 1, now)).toBe(
      "2026-07-20"
    );
    expect(
      getLocalWeek("2026-07-27", "America/New_York", 1, now)
    ).toMatchObject({
      from: "2026-07-27T04:00:00.000Z",
      to: "2026-08-03T04:00:00.000Z"
    });
  });

  it("omits nonexistent spring-forward slots", () => {
    const week = getLocalWeek(
      "2026-03-02",
      "America/New_York",
      1,
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
      1,
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
      1,
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
        minuteOfDay: 60,
        offsetLabel: "UTC-04:00"
      },
      {
        id: "2026-11-01T06:00:00.000Z",
        instant: "2026-11-01T06:00:00.000Z",
        localDate: "2026-11-01",
        label: "01:00",
        minuteOfDay: 60,
        offsetLabel: "UTC-05:00"
      }
    ]);
  });

  it("shifts Monday week starts with local calendar arithmetic", () => {
    expect(shiftLocalWeekStart("2026-03-02", "America/New_York", 1, 1)).toBe(
      "2026-03-09"
    );
    expect(shiftLocalWeekStart("2026-11-02", "America/New_York", -1, 1)).toBe(
      "2026-10-26"
    );
    expect(shiftLocalWeekStart("2026-07-27", "Europe/Kyiv", 0, 1)).toBe(
      "2026-07-27"
    );
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
    expect(() => getCurrentLocalWeekStart("Not/A_Zone", 1, new Date())).toThrow(
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
        getCurrentLocalWeekStart(
          timezone,
          1,
          new Date("2026-07-27T10:00:00.000Z")
        )
      ).toThrow(/timezone/i);
    }
  );

  it("rejects invalid local dates and non-Monday week starts", () => {
    expect(() => getLocalWeek("2026-02-30", "Europe/Kyiv", 1)).toThrow(
      /weekStart/i
    );
    expect(() =>
      shiftLocalWeekStart("2026-02-30", "Europe/Kyiv", 1, 1)
    ).toThrow(/weekStart/i);
  });

  it("rejects invalid week shift zones and non-integer offsets", () => {
    expect(() => shiftLocalWeekStart("2026-07-27", "Not/A_Zone", 1, 1)).toThrow(
      /timezone/i
    );
    expect(() =>
      shiftLocalWeekStart("2026-07-27", "Europe/Kyiv", 1.5, 1)
    ).toThrow(/weekOffset/i);
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

describe("configurable week start", () => {
  // 2026-07-27 is a Monday; the week runs Mon 07-27 .. Sun 08-02.
  const wednesday = new Date("2026-07-29T12:00:00.000Z");

  it("anchors the current week on each of the seven weekdays", () => {
    const expected: Record<number, string> = {
      1: "2026-07-27",
      2: "2026-07-28",
      3: "2026-07-29",
      4: "2026-07-23",
      5: "2026-07-24",
      6: "2026-07-25",
      7: "2026-07-26"
    };

    for (const [weekStartsOn, weekStart] of Object.entries(expected)) {
      expect(
        getCurrentLocalWeekStart("Europe/Kyiv", Number(weekStartsOn), wednesday)
      ).toBe(weekStart);
    }
  });

  it("builds a Sunday-anchored week with Sunday first and Saturday last", () => {
    const week = getLocalWeek("2026-07-26", "Europe/Kyiv", 7, wednesday);

    expect(week.days.map((day) => day.localDate)).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01"
    ]);
  });

  it("shifts weeks while preserving a non-Monday anchor", () => {
    expect(shiftLocalWeekStart("2026-07-26", "Europe/Kyiv", 1, 7)).toBe(
      "2026-08-02"
    );
    expect(shiftLocalWeekStart("2026-07-26", "Europe/Kyiv", -1, 7)).toBe(
      "2026-07-19"
    );
  });

  it("keeps a Sunday anchor across the Kyiv spring-forward week", () => {
    // Kyiv moves to summer time on Sunday 2026-03-29.
    const week = getLocalWeek(
      "2026-03-29",
      "Europe/Kyiv",
      7,
      new Date("2026-03-30T12:00:00.000Z")
    );

    expect(week.days[0]?.localDate).toBe("2026-03-29");
    expect(week.days[6]?.localDate).toBe("2026-04-04");
  });

  it("keeps a Sunday anchor across the New York spring-forward week", () => {
    // The United States moves to daylight time on Sunday 2026-03-08.
    expect(shiftLocalWeekStart("2026-03-01", "America/New_York", 1, 7)).toBe(
      "2026-03-08"
    );
  });
});

describe("week starts in zones whose DST gap lands on midnight", () => {
  // Santiago moves to summer time at 24:00 on Saturday 2026-09-05, so Sunday
  // 2026-09-06 has no 00:00 and its first existing instant is 01:00 -03:00.
  // Beirut does the same on Sunday 2026-03-29 (first instant 01:00 +03:00).

  it("anchors on a Sunday whose local midnight does not exist", () => {
    for (const now of [
      new Date("2026-09-06T15:00:00.000Z"), // the gap Sunday itself
      new Date("2026-09-09T15:00:00.000Z"), // midweek
      new Date("2026-09-12T15:00:00.000Z") // the Saturday that closes the week
    ]) {
      expect(getCurrentLocalWeekStart("America/Santiago", 7, now)).toBe(
        "2026-09-06"
      );
    }

    expect(
      getCurrentLocalWeekStart(
        "Asia/Beirut",
        7,
        new Date("2026-03-29T10:00:00.000Z")
      )
    ).toBe("2026-03-29");
  });

  it("starts the week at the first instant that exists on the gap day", () => {
    const santiago = getLocalWeek(
      "2026-09-06",
      "America/Santiago",
      7,
      new Date("2026-09-09T15:00:00.000Z")
    );

    // 04:00Z is 01:00 -03:00, not the nonexistent 00:00.
    expect(santiago.from).toBe("2026-09-06T04:00:00.000Z");
    expect(santiago.days.map((day) => day.localDate)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12"
    ]);

    const beirut = getLocalWeek(
      "2026-03-29",
      "Asia/Beirut",
      7,
      new Date("2026-04-01T10:00:00.000Z")
    );

    expect(beirut.from).toBe("2026-03-28T22:00:00.000Z");
    expect(beirut.days[0]?.localDate).toBe("2026-03-29");
    expect(beirut.days[6]?.localDate).toBe("2026-04-04");
  });

  it("normalizes back to plain midnight when the anchor precedes the gap day", () => {
    // Standing on the gap day, every earlier anchor resolves to a normal date
    // whose midnight exists; the week start must not inherit the 01:00 shift.
    const onGapDay = new Date("2026-09-06T15:00:00.000Z");
    const expected: Record<number, string> = {
      1: "2026-08-31",
      2: "2026-09-01",
      3: "2026-09-02",
      4: "2026-09-03",
      5: "2026-09-04",
      6: "2026-09-05",
      7: "2026-09-06"
    };

    for (const [weekStartsOn, weekStart] of Object.entries(expected)) {
      expect(
        getCurrentLocalWeekStart(
          "America/Santiago",
          Number(weekStartsOn),
          onGapDay
        )
      ).toBe(weekStart);
      expect(
        snapToLocalWeekStart(
          "2026-09-06",
          "America/Santiago",
          Number(weekStartsOn)
        )
      ).toBe(weekStart);
    }
  });

  it("shifts weeks across a gap anchor without drifting", () => {
    expect(shiftLocalWeekStart("2026-09-06", "America/Santiago", 1, 7)).toBe(
      "2026-09-13"
    );
    expect(shiftLocalWeekStart("2026-09-06", "America/Santiago", -1, 7)).toBe(
      "2026-08-30"
    );
    // Landing on the gap week from the neighbouring weeks resolves identically.
    expect(shiftLocalWeekStart("2026-08-30", "America/Santiago", 1, 7)).toBe(
      "2026-09-06"
    );
  });

  it("anchors the Sunday that follows a midnight fall-back", () => {
    // Beirut returns to winter time at 24:00 on Saturday 2026-10-24, so the
    // following Sunday starts at a plain 00:00 +02:00.
    const week = getLocalWeek(
      "2026-10-25",
      "Asia/Beirut",
      7,
      new Date("2026-10-28T10:00:00.000Z")
    );

    expect(
      getCurrentLocalWeekStart(
        "Asia/Beirut",
        7,
        new Date("2026-10-28T10:00:00.000Z")
      )
    ).toBe("2026-10-25");
    expect(week.from).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("snapping a local date to its week start", () => {
  it("snaps any weekday to the containing week under each anchor", () => {
    expect(snapToLocalWeekStart("2026-07-29", "Europe/Kyiv", 1)).toBe(
      "2026-07-27"
    );
    expect(snapToLocalWeekStart("2026-07-29", "Europe/Kyiv", 7)).toBe(
      "2026-07-26"
    );
    expect(snapToLocalWeekStart("2026-07-29", "Europe/Kyiv", 6)).toBe(
      "2026-07-25"
    );
  });

  it("returns the input when it is already the week start", () => {
    expect(snapToLocalWeekStart("2026-07-27", "Europe/Kyiv", 1)).toBe(
      "2026-07-27"
    );
  });

  it("parses the local date in the target zone, not as UTC midnight", () => {
    // Regression guard: `new Date("2026-08-03")` is UTC midnight, which is
    // Sunday 2026-08-02 20:00 in New York and would snap to 2026-07-27.
    expect(snapToLocalWeekStart("2026-08-03", "America/New_York", 1)).toBe(
      "2026-08-03"
    );
    expect(snapToLocalWeekStart("2026-08-03", "America/New_York", 7)).toBe(
      "2026-08-02"
    );
  });

  it("rejects malformed local dates and invalid zones", () => {
    expect(() => snapToLocalWeekStart("2026-02-30", "Europe/Kyiv", 1)).toThrow(
      RangeError
    );
    expect(() => snapToLocalWeekStart("2026-07-27", "Not/A_Zone", 1)).toThrow(
      RangeError
    );
  });
});

describe("week start validation", () => {
  it("rejects values outside the integer range 1 to 7", () => {
    for (const invalid of [0, 8, 1.5, Number.NaN]) {
      expect(() =>
        getCurrentLocalWeekStart("Europe/Kyiv", invalid, new Date())
      ).toThrow(/weekStartsOn/);
      expect(() =>
        snapToLocalWeekStart("2026-07-27", "Europe/Kyiv", invalid)
      ).toThrow(/weekStartsOn/);
    }
  });

  it("rejects a week start that does not match the configured anchor", () => {
    expect(() => getLocalWeek("2026-07-28", "Europe/Kyiv", 1)).toThrow(
      /weekday 1/
    );
    expect(() => getLocalWeek("2026-07-27", "Europe/Kyiv", 7)).toThrow(
      /weekday 7/
    );
    expect(() =>
      shiftLocalWeekStart("2026-07-28", "Europe/Kyiv", 1, 1)
    ).toThrow(/weekday 1/);
  });
});

describe("timezone validation helper", () => {
  it("accepts IANA zones and rejects fixed offsets and unknown zones", () => {
    expect(isValidTimezone("Europe/Kyiv")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("+02:00")).toBe(false);
    expect(isValidTimezone("Not/A_Zone")).toBe(false);
  });
});

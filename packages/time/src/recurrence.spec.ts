import { describe, expect, it } from "vitest";
import { buildKyivWeeklySeries } from "./index.js";

describe("buildKyivWeeklySeries", () => {
  it("keeps Kyiv 09:00 across the spring DST transition", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-03-22T07:00:00.000Z",
        "2026-03-22T08:00:00.000Z",
        3
      )
    ).toEqual({
      firstLocalDate: "2026-03-22",
      firstLocalStartTime: "09:00:00",
      durationMinutes: 60,
      occurrences: [
        {
          occurrenceIndex: 0,
          startAt: "2026-03-22T07:00:00.000Z",
          endAt: "2026-03-22T08:00:00.000Z"
        },
        {
          occurrenceIndex: 1,
          startAt: "2026-03-29T06:00:00.000Z",
          endAt: "2026-03-29T07:00:00.000Z"
        },
        {
          occurrenceIndex: 2,
          startAt: "2026-04-05T06:00:00.000Z",
          endAt: "2026-04-05T07:00:00.000Z"
        }
      ]
    });
  });

  it("keeps Kyiv 09:00 across the autumn DST transition", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-10-18T06:00:00.000Z",
        "2026-10-18T07:00:00.000Z",
        3
      )
    ).toMatchObject({
      firstLocalDate: "2026-10-18",
      firstLocalStartTime: "09:00:00",
      durationMinutes: 60,
      occurrences: [
        {
          occurrenceIndex: 0,
          startAt: "2026-10-18T06:00:00.000Z",
          endAt: "2026-10-18T07:00:00.000Z"
        },
        {
          occurrenceIndex: 1,
          startAt: "2026-10-25T07:00:00.000Z",
          endAt: "2026-10-25T08:00:00.000Z"
        },
        {
          occurrenceIndex: 2,
          startAt: "2026-11-01T07:00:00.000Z",
          endAt: "2026-11-01T08:00:00.000Z"
        }
      ]
    });
  });

  it("rejects a future Kyiv wall time that falls in the spring DST gap", () => {
    expect(() =>
      buildKyivWeeklySeries(
        "2026-03-22T01:30:00.000Z",
        "2026-03-22T02:00:00.000Z",
        2
      )
    ).toThrow(RangeError);
  });

  it("preserves the supplied first-fold interval and returns only ordered intervals", () => {
    const projection = buildKyivWeeklySeries(
      "2026-10-25T00:30:00.000Z",
      "2026-10-25T01:00:00.000Z",
      2
    );

    expect(projection.occurrences[0]).toEqual({
      occurrenceIndex: 0,
      startAt: "2026-10-25T00:30:00.000Z",
      endAt: "2026-10-25T01:00:00.000Z"
    });
    expect(
      projection.occurrences.every(
        (occurrence) =>
          Date.parse(occurrence.startAt) < Date.parse(occurrence.endAt)
      )
    ).toBe(true);
  });

  it("preserves the supplied second-fold interval", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-10-25T01:30:00.000Z",
        "2026-10-25T02:00:00.000Z",
        2
      ).occurrences[0]
    ).toEqual({
      occurrenceIndex: 0,
      startAt: "2026-10-25T01:30:00.000Z",
      endAt: "2026-10-25T02:00:00.000Z"
    });
  });

  it("uses the first UTC candidate for a future Kyiv autumn fold", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-09-27T00:30:00.000Z",
        "2026-09-27T01:00:00.000Z",
        5
      ).occurrences[4]
    ).toEqual({
      occurrenceIndex: 4,
      startAt: "2026-10-25T00:30:00.000Z",
      endAt: "2026-10-25T01:00:00.000Z"
    });
  });

  it.each([
    {
      durationMinutes: 30,
      initialEndAt: "2026-07-27T07:30:00.000Z",
      secondEndAt: "2026-08-03T07:30:00.000Z"
    },
    {
      durationMinutes: 240,
      initialEndAt: "2026-07-27T11:00:00.000Z",
      secondEndAt: "2026-08-03T11:00:00.000Z"
    }
  ])(
    "preserves a $durationMinutes-minute duration",
    ({ durationMinutes, initialEndAt, secondEndAt }) => {
      const projection = buildKyivWeeklySeries(
        "2026-07-27T07:00:00.000Z",
        initialEndAt,
        2
      );

      expect(projection.durationMinutes).toBe(durationMinutes);
      expect(projection.occurrences[1]).toEqual({
        occurrenceIndex: 1,
        startAt: "2026-08-03T07:00:00.000Z",
        endAt: secondEndAt
      });
    }
  );

  it("accepts the minimum occurrence count", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-07-27T07:00:00.000Z",
        "2026-07-27T08:00:00.000Z",
        2
      ).occurrences
    ).toHaveLength(2);
  });

  it("accepts the maximum occurrence count", () => {
    expect(
      buildKyivWeeklySeries(
        "2026-07-27T07:00:00.000Z",
        "2026-07-27T08:00:00.000Z",
        52
      ).occurrences
    ).toHaveLength(52);
  });

  it.each([1, 53, 2.5])("rejects occurrence count %s", (occurrenceCount) => {
    expect(() =>
      buildKyivWeeklySeries(
        "2026-07-27T07:00:00.000Z",
        "2026-07-27T08:00:00.000Z",
        occurrenceCount
      )
    ).toThrow(RangeError);
  });

  it.each([
    ["not-an-instant", "2026-07-27T08:00:00.000Z"],
    ["2026-07-27T07:00:00.000Z", "not-an-instant"]
  ])("rejects malformed instants", (startAt, endAt) => {
    expect(() => buildKyivWeeklySeries(startAt, endAt, 2)).toThrow(RangeError);
  });

  it.each([
    ["2026-07-27T07:00:00.000Z", "2026-07-27T07:00:00.000Z"],
    ["2026-07-27T08:00:00.000Z", "2026-07-27T07:00:00.000Z"]
  ])(
    "rejects an interval whose end is not after its start",
    (startAt, endAt) => {
      expect(() => buildKyivWeeklySeries(startAt, endAt, 2)).toThrow(
        RangeError
      );
    }
  );

  it("rejects a duration that is not divisible by 30 minutes", () => {
    expect(() =>
      buildKyivWeeklySeries(
        "2026-07-27T07:00:00.000Z",
        "2026-07-27T07:45:00.000Z",
        2
      )
    ).toThrow(RangeError);
  });
});

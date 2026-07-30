import { describe, expect, it } from "vitest";
import { validateCreateBooking } from "../../src/bookings/booking-policy.js";

const NOW = new Date("2035-01-15T06:00:00.000Z");

describe("booking creation policy", () => {
  it("trims a valid title and accepts an adjacent Kyiv office interval", () => {
    expect(
      validateCreateBooking(
        {
          title: "  Планування спринту  ",
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T07:30:00.000Z"
        },
        NOW
      )
    ).toEqual({
      title: "Планування спринту",
      startAt: new Date("2035-01-15T07:00:00.000Z"),
      endAt: new Date("2035-01-15T07:30:00.000Z")
    });
  });

  it.each([
    ["an empty title", "   "],
    ["a title over 100 characters", "а".repeat(101)]
  ])("rejects %s", (_label, title) => {
    expect(() =>
      validateCreateBooking(
        {
          title,
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T07:30:00.000Z"
        },
        NOW
      )
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "INVALID_BOOKING_TITLE",
        fields: { title: expect.any(Array) }
      })
    );
  });

  it("requires the start instant to be strictly later than the server clock", () => {
    expect(() =>
      validateCreateBooking(
        {
          title: "Планування",
          startAt: NOW.toISOString(),
          endAt: "2035-01-15T06:30:00.000Z"
        },
        NOW
      )
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "BOOKING_NOT_IN_FUTURE",
        fields: { startAt: expect.any(Array) }
      })
    );
  });

  it.each([
    [
      "a start between grid boundaries",
      "2035-01-15T07:15:00.000Z",
      "2035-01-15T07:45:00.000Z"
    ],
    [
      "an end between grid boundaries",
      "2035-01-15T07:00:00.000Z",
      "2035-01-15T07:45:00.000Z"
    ]
  ])("rejects %s", (_label, startAt, endAt) => {
    expect(() =>
      validateCreateBooking({ title: "Планування", startAt, endAt }, NOW)
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "BOOKING_OFF_GRID"
      })
    );
  });

  it.each([
    [
      "a non-positive interval",
      "2035-01-15T07:00:00.000Z",
      "2035-01-15T07:00:00.000Z"
    ],
    [
      "less than 30 minutes",
      "2035-01-15T07:00:00.000Z",
      "2035-01-15T07:15:00.000Z"
    ],
    [
      "more than four hours",
      "2035-01-15T07:00:00.000Z",
      "2035-01-15T11:30:00.000Z"
    ]
  ])("rejects %s", (_label, startAt, endAt) => {
    expect(() =>
      validateCreateBooking({ title: "Планування", startAt, endAt }, NOW)
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "INVALID_BOOKING_DURATION"
      })
    );
  });

  it.each([
    [
      "before Kyiv office hours",
      "2035-01-15T06:30:00.000Z",
      "2035-01-15T07:00:00.000Z"
    ],
    [
      "after Kyiv office hours",
      "2035-01-15T17:00:00.000Z",
      "2035-01-15T17:30:00.000Z"
    ]
  ])("rejects an interval %s", (_label, startAt, endAt) => {
    expect(() =>
      validateCreateBooking({ title: "Планування", startAt, endAt }, NOW)
    ).toThrow(
      expect.objectContaining({
        status: 400,
        code: "BOOKING_OUTSIDE_OFFICE_HOURS"
      })
    );
  });

  it("uses the Kyiv DST offset for the concrete office date", () => {
    expect(
      validateCreateBooking(
        {
          title: "Літня зустріч",
          startAt: "2035-07-16T06:00:00.000Z",
          endAt: "2035-07-16T06:30:00.000Z"
        },
        NOW
      )
    ).toMatchObject({
      startAt: new Date("2035-07-16T06:00:00.000Z"),
      endAt: new Date("2035-07-16T06:30:00.000Z")
    });
  });
});

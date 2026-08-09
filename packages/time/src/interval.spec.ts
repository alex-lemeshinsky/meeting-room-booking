import { describe, expect, it } from "vitest";
import { intervalsOverlap, parseInterval } from "./index.js";

const BASE = parseInterval(
  "2031-01-15T10:00:00.000Z",
  "2031-01-15T12:00:00.000Z"
);

function overlapsBase(startAt: string, endAt: string): boolean {
  return intervalsOverlap(BASE, parseInterval(startAt, endAt));
}

describe("booking interval overlap", () => {
  it("treats touching intervals as free", () => {
    expect(
      overlapsBase("2031-01-15T08:00:00.000Z", "2031-01-15T10:00:00.000Z")
    ).toBe(false);
    expect(
      overlapsBase("2031-01-15T12:00:00.000Z", "2031-01-15T14:00:00.000Z")
    ).toBe(false);
  });

  it("detects partial overlap across either boundary", () => {
    expect(
      overlapsBase("2031-01-15T09:00:00.000Z", "2031-01-15T11:00:00.000Z")
    ).toBe(true);
    expect(
      overlapsBase("2031-01-15T11:00:00.000Z", "2031-01-15T13:00:00.000Z")
    ).toBe(true);
  });

  it("detects an exact match", () => {
    expect(
      overlapsBase("2031-01-15T10:00:00.000Z", "2031-01-15T12:00:00.000Z")
    ).toBe(true);
  });

  it("detects containment in both directions", () => {
    expect(
      overlapsBase("2031-01-15T10:30:00.000Z", "2031-01-15T11:30:00.000Z")
    ).toBe(true);
    expect(
      overlapsBase("2031-01-15T09:00:00.000Z", "2031-01-15T13:00:00.000Z")
    ).toBe(true);
  });

  it("keeps the same clock time on neighbouring days free", () => {
    expect(
      overlapsBase("2031-01-14T10:00:00.000Z", "2031-01-14T12:00:00.000Z")
    ).toBe(false);
    expect(
      overlapsBase("2031-01-16T10:00:00.000Z", "2031-01-16T12:00:00.000Z")
    ).toBe(false);
  });

  it("is symmetric", () => {
    const other = parseInterval(
      "2031-01-15T11:00:00.000Z",
      "2031-01-15T13:00:00.000Z"
    );

    expect(intervalsOverlap(BASE, other)).toBe(intervalsOverlap(other, BASE));
  });
});

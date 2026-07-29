import { describe, expect, it, vi } from "vitest";
import {
  parseSeedNowOverride,
  resolveSeedNow
} from "../../../../prisma/seed-clock.js";

describe("seed clock", () => {
  it("defers the real clock until booking generation resolves the absent override", () => {
    const readCurrentTime = vi.fn(() => new Date("2031-04-16T08:30:00.000Z"));

    const override = parseSeedNowOverride(undefined);

    expect(override).toBeUndefined();
    expect(readCurrentTime).not.toHaveBeenCalled();
    expect(resolveSeedNow(override, readCurrentTime).toISOString()).toBe(
      "2031-04-16T08:30:00.000Z"
    );
    expect(readCurrentTime).toHaveBeenCalledOnce();
  });

  it("accepts a canonical override without reading the real clock", () => {
    const readCurrentTime = vi.fn(() => new Date("2031-04-16T08:30:00.000Z"));
    const override = parseSeedNowOverride("2030-01-09T10:00:00.000Z");

    expect(resolveSeedNow(override, readCurrentTime).toISOString()).toBe(
      "2030-01-09T10:00:00.000Z"
    );
    expect(readCurrentTime).not.toHaveBeenCalled();
  });

  it.each([
    "2030-01-09T10:00:00Z",
    "2030-01-09T12:00:00.000+02:00",
    "2030-02-31T10:00:00.000Z"
  ])("rejects non-canonical seed override %s", (value) => {
    expect(() => parseSeedNowOverride(value)).toThrow(RangeError);
  });
});

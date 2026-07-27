import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "./clock.js";

describe("Clock", () => {
  it("returns a defensive copy from FixedClock", () => {
    const source = new Date("2026-07-27T10:00:00.000Z");
    const clock = new FixedClock(source);

    const first = clock.now();
    first.setUTCFullYear(2030);

    expect(clock.now().toISOString()).toBe("2026-07-27T10:00:00.000Z");
  });

  it("allows tests to move FixedClock explicitly", () => {
    const clock = new FixedClock(new Date("2026-07-27T10:00:00.000Z"));
    clock.set(new Date("2026-07-27T10:30:00.000Z"));

    expect(clock.now().toISOString()).toBe("2026-07-27T10:30:00.000Z");
  });

  it("returns the current instant from SystemClock", () => {
    const before = Date.now();
    const result = new SystemClock().now().getTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

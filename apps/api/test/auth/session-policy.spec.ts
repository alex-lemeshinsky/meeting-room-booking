import { describe, expect, it } from "vitest";
import {
  calculateNextIdleExpiry,
  calculateSessionWindow,
  isSessionExpired
} from "../../src/auth/session/session-policy.js";

describe("session policy", () => {
  it("creates a seven-day idle window inside a thirty-day absolute window", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");

    const window = calculateSessionWindow(now);

    expect(window.lastSeenAt.toISOString()).toBe("2026-07-27T12:00:00.000Z");
    expect(window.idleExpiresAt.toISOString()).toBe("2026-08-03T12:00:00.000Z");
    expect(window.absoluteExpiresAt.toISOString()).toBe(
      "2026-08-26T12:00:00.000Z"
    );
  });

  it("caps a refreshed idle expiry at the absolute expiry", () => {
    const capped = calculateNextIdleExpiry(
      new Date("2026-08-25T12:00:00.000Z"),
      new Date("2026-08-26T12:00:00.000Z")
    );

    expect(capped.toISOString()).toBe("2026-08-26T12:00:00.000Z");
  });

  it("expires sessions at either expiry boundary", () => {
    const now = new Date("2026-08-03T12:00:00.000Z");

    expect(
      isSessionExpired(
        now,
        new Date("2026-08-03T12:00:00.000Z"),
        new Date("2026-08-26T12:00:00.000Z")
      )
    ).toBe(true);
    expect(
      isSessionExpired(
        new Date("2026-08-26T12:00:00.000Z"),
        new Date("2026-08-27T12:00:00.000Z"),
        new Date("2026-08-26T12:00:00.000Z")
      )
    ).toBe(true);
  });
});

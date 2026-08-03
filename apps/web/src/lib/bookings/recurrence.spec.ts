import { describe, expect, it } from "vitest";
import { recurrenceSummary } from "./recurrence";

describe("recurrenceSummary", () => {
  it("formats count and final occurrence date in specified timezone", () => {
    expect(
      recurrenceSummary("2026-08-04T07:00:00.000Z", 8, "Europe/Kyiv")
    ).toEqual({
      countLabel: "8 повторень",
      finalDateLabel: "22 вересня 2026 р."
    });
  });

  it("handles 2 occurrences (first + 1 week)", () => {
    expect(
      recurrenceSummary("2026-08-04T07:00:00.000Z", 2, "Europe/Kyiv")
    ).toEqual({
      countLabel: "2 повторення",
      finalDateLabel: "11 серпня 2026 р."
    });
  });
});

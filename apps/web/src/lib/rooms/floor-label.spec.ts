import { describe, expect, it } from "vitest";
import { floorLabel } from "./floor-label";

describe("floorLabel", () => {
  it.each([
    [1, "1-й поверх"],
    [2, "2-й поверх"],
    [3, "3-й поверх"],
    [4, "4-й поверх"],
    [11, "11-й поверх"]
  ])("labels floor %i", (floor, expected) => {
    expect(floorLabel(floor)).toBe(expected);
  });
});

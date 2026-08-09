import { describe, expect, it } from "vitest";
import { capacityLabel } from "./capacity-label";

describe("capacityLabel", () => {
  it.each([
    [1, "1 місце"],
    [2, "2 місця"],
    [4, "4 місця"],
    [5, "5 місць"],
    [10, "10 місць"],
    [11, "11 місць"],
    [21, "21 місце"],
    [22, "22 місця"]
  ])("labels %i seats", (capacity, expected) => {
    expect(capacityLabel(capacity)).toBe(expected);
  });
});

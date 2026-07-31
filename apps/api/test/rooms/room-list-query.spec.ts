import { describe, expect, it } from "vitest";
import { parseMinimumCapacity } from "../../src/rooms/room-list-query.dto.js";

describe("parseMinimumCapacity", () => {
  it.each([
    [undefined, undefined],
    ["12", 12],
    [12, 12]
  ])("normalizes %j to %j", (value, expected) => {
    expect(parseMinimumCapacity(value)).toBe(expected);
  });

  it.each(["", "0", "-1", "1.5", "six", ["1", "2"], 0, 1.5])(
    "rejects invalid value %j with the standard API error",
    (value) => {
      expect(() => parseMinimumCapacity(value)).toThrowError(
        expect.objectContaining({
          status: 400,
          code: "VALIDATION_ERROR",
          fields: { minCapacity: ["minCapacity must be a positive integer"] }
        })
      );
    }
  );
});

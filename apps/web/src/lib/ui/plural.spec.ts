import { describe, expect, it } from "vitest";
import { pluralizeUk } from "./plural";

function seats(count: number): string {
  return pluralizeUk(count, "місце", "місця", "місць");
}

describe("pluralizeUk", () => {
  it("uses the singular form for 1 and compounds ending in 1", () => {
    expect(seats(1)).toBe("місце");
    expect(seats(21)).toBe("місце");
    expect(seats(101)).toBe("місце");
  });

  it("uses the few form for 2-4 and compounds ending in 2-4", () => {
    expect(seats(2)).toBe("місця");
    expect(seats(4)).toBe("місця");
    expect(seats(22)).toBe("місця");
  });

  it("uses the many form for 0, 5-20 and compounds ending in 5-9", () => {
    expect(seats(0)).toBe("місць");
    expect(seats(5)).toBe("місць");
    expect(seats(16)).toBe("місць");
    expect(seats(25)).toBe("місць");
  });

  it("uses the many form for the teens that end in 1-4", () => {
    expect(seats(11)).toBe("місць");
    expect(seats(12)).toBe("місць");
    expect(seats(14)).toBe("місць");
  });
});

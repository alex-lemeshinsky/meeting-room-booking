import { describe, expect, it } from "vitest";
import { parseMinCapacity } from "./capacity-filter";

describe("parseMinCapacity", () => {
  it("treats an omitted query as an inactive filter", () => {
    expect(parseMinCapacity(undefined)).toEqual({
      kind: "absent",
      inputValue: ""
    });
  });

  it("normalizes one positive safe integer", () => {
    expect(parseMinCapacity("10")).toEqual({
      kind: "valid",
      inputValue: "10",
      minCapacity: 10
    });
  });

  it.each(["", "0", "-1", "1.5", "six", "9007199254740992"])(
    "rejects invalid value %s",
    (value) => {
      expect(parseMinCapacity(value)).toEqual({
        kind: "invalid",
        inputValue: value,
        error: "Введіть ціле число від 1."
      });
    }
  );

  it("rejects repeated capacity values", () => {
    expect(parseMinCapacity(["8", "10"])).toEqual({
      kind: "invalid",
      inputValue: "",
      error: "Вкажіть одну мінімальну місткість."
    });
  });
});

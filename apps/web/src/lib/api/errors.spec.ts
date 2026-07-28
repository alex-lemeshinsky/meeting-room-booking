import { describe, expect, it } from "vitest";
import { isApiErrorBody } from "./errors";

describe("isApiErrorBody", () => {
  it("accepts the generated public API error envelope", () => {
    expect(
      isApiErrorBody({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: { email: ["Введіть коректний email"] },
          requestId: "request-123"
        }
      })
    ).toBe(true);
  });

  it("rejects an array-shaped field-error container", () => {
    expect(
      isApiErrorBody({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: [["not", "a", "mapping"]],
          requestId: "request-123"
        }
      })
    ).toBe(false);
  });
});

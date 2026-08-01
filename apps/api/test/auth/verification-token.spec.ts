import { describe, expect, it } from "vitest";
import {
  hashVerificationToken,
  NodeEmailVerificationTokenGenerator
} from "../../src/auth/email-verification/verification-token.js";

describe("email verification tokens", () => {
  it("generates a 32-byte base64url token", () => {
    const rawToken = new NodeEmailVerificationTokenGenerator().generate();

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes tokens with SHA-256 without retaining the raw value", () => {
    const rawToken = "A".repeat(43);

    expect(hashVerificationToken(rawToken)).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"
    );
    expect(hashVerificationToken(rawToken)).not.toBe(rawToken);
  });
});

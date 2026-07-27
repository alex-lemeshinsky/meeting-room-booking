import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../../src/auth/password/argon2-password-hasher.js";
import { normalizeEmail } from "../../src/users/users.service.js";

describe("password and email boundaries", () => {
  it("normalizes surrounding whitespace and email casing", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });

  it("hashes and verifies passwords with Argon2id", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash("correct horse");

    expect(await hasher.verify(hash, "correct horse")).toBe(true);
    expect(await hasher.verify(hash, "wrong horse")).toBe(false);
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});

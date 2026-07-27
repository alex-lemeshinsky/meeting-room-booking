import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import type { PasswordHasher } from "../../src/auth/password/password-hasher.js";
import type { UsersService } from "../../src/users/users.service.js";

describe("AuthService", () => {
  it("registers a normalized user using a password hash", async () => {
    const users = {
      createUser: vi.fn().mockResolvedValue({
        id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
        name: "Олена",
        emailNormalized: "olena@example.com"
      }),
      toPublicUser: vi.fn().mockReturnValue({
        id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
        name: "Олена",
        email: "olena@example.com"
      })
    } as unknown as UsersService;
    const passwords = {
      hash: vi.fn().mockResolvedValue("$argon2id$hashed"),
      verify: vi.fn(),
      burnUnknownPasswordCheck: vi.fn()
    } satisfies PasswordHasher;
    const service = new AuthService(users, passwords);

    await expect(
      service.register({
        name: "Олена",
        email: " OLENA@example.com ",
        password: "Rooms123!"
      })
    ).resolves.toEqual({
      user: {
        id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
        name: "Олена",
        email: "olena@example.com"
      }
    });

    expect(passwords.hash).toHaveBeenCalledWith("Rooms123!");
    expect(users.createUser).toHaveBeenCalledWith({
      name: "Олена",
      emailNormalized: "olena@example.com",
      passwordHash: "$argon2id$hashed"
    });
  });
});

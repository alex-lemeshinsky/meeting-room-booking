import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../../src/auth/auth.service.js";
import type { EmailVerificationService } from "../../src/auth/email-verification/email-verification.service.js";
import type { PasswordHasher } from "../../src/auth/password/password-hasher.js";
import type { SessionService } from "../../src/auth/session/session.service.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import type { UsersService } from "../../src/users/users.service.js";

describe("AuthService", () => {
  it("creates a user and verification token in one transaction before logging the link", async () => {
    const user = {
      id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
      name: "Олена",
      emailNormalized: "olena@example.com"
    };
    const users = {
      createUser: vi.fn().mockResolvedValue(user),
      toPublicUser: vi.fn().mockReturnValue({
        id: user.id,
        name: "Олена",
        email: "olena@example.com"
      })
    };
    const passwords = {
      hash: vi.fn().mockResolvedValue("$argon2id$hashed"),
      verify: vi.fn(),
      burnUnknownPasswordCheck: vi.fn()
    } satisfies PasswordHasher;
    const sessions = {
      createSession: vi.fn()
    } as unknown as SessionService;
    const transaction = { user: {}, emailVerificationToken: {} };
    const database = {
      $transaction: vi.fn(async (work) => work(transaction))
    };
    const verification = {
      issueForUser: vi.fn().mockResolvedValue({
        rawToken: "A".repeat(43),
        expiresAt: new Date("2026-08-02T09:00:00.000Z")
      }),
      logDevelopmentLink: vi.fn()
    };
    const service = new AuthService(
      users as unknown as UsersService,
      passwords,
      sessions,
      database as unknown as DatabaseService,
      verification as unknown as EmailVerificationService
    );

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
    expect(users.createUser).toHaveBeenCalledWith(
      {
        name: "Олена",
        emailNormalized: "olena@example.com",
        passwordHash: "$argon2id$hashed"
      },
      transaction
    );
    expect(verification.issueForUser).toHaveBeenCalledWith(
      user.id,
      transaction
    );
    expect(verification.logDevelopmentLink).toHaveBeenCalledWith(
      "A".repeat(43)
    );
    expect(passwords.hash.mock.invocationCallOrder[0]).toBeLessThan(
      database.$transaction.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
    expect(users.createUser.mock.invocationCallOrder[0]).toBeLessThan(
      verification.issueForUser.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
    expect(verification.issueForUser.mock.invocationCallOrder[0]).toBeLessThan(
      verification.logDevelopmentLink.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY
    );
  });

  it("does not log a verification link when token issuance fails", async () => {
    const users = {
      createUser: vi.fn().mockResolvedValue({
        id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
        name: "Олена",
        emailNormalized: "olena@example.com"
      }),
      toPublicUser: vi.fn()
    };
    const passwords = {
      hash: vi.fn().mockResolvedValue("$argon2id$hashed"),
      verify: vi.fn(),
      burnUnknownPasswordCheck: vi.fn()
    } satisfies PasswordHasher;
    const transaction = { user: {}, emailVerificationToken: {} };
    const database = {
      $transaction: vi.fn(async (work) => work(transaction))
    };
    const issuanceError = new Error("token persistence failed");
    const verification = {
      issueForUser: vi.fn().mockRejectedValue(issuanceError),
      logDevelopmentLink: vi.fn()
    };
    const service = new AuthService(
      users as unknown as UsersService,
      passwords,
      {} as SessionService,
      database as unknown as DatabaseService,
      verification as unknown as EmailVerificationService
    );

    await expect(
      service.register({
        name: "Олена",
        email: "olena@example.com",
        password: "Rooms123!"
      })
    ).rejects.toBe(issuanceError);

    expect(verification.logDevelopmentLink).not.toHaveBeenCalled();
  });

  it("returns the same invalid-credentials error for an unknown email", async () => {
    const users = {
      findByNormalizedEmail: vi.fn().mockResolvedValue(null),
      toPublicUser: vi.fn()
    } as unknown as UsersService;
    const passwords = {
      hash: vi.fn(),
      verify: vi.fn(),
      burnUnknownPasswordCheck: vi.fn().mockResolvedValue(undefined)
    } satisfies PasswordHasher;
    const sessions = {
      createSession: vi.fn()
    } as unknown as SessionService;
    const service = new AuthService(
      users,
      passwords,
      sessions,
      {} as DatabaseService,
      {} as EmailVerificationService
    );

    await expect(
      service.login({ email: "missing@example.com", password: "wrong" })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });

    expect(passwords.burnUnknownPasswordCheck).toHaveBeenCalledWith("wrong");
  });

  it("returns the same invalid-credentials error for a wrong password", async () => {
    const users = {
      findByNormalizedEmail: vi.fn().mockResolvedValue({
        id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
        name: "Олена",
        emailNormalized: "known@example.com",
        passwordHash: "$argon2id$hashed"
      }),
      toPublicUser: vi.fn()
    } as unknown as UsersService;
    const passwords = {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(false),
      burnUnknownPasswordCheck: vi.fn()
    } satisfies PasswordHasher;
    const sessions = {
      createSession: vi.fn()
    } as unknown as SessionService;
    const service = new AuthService(
      users,
      passwords,
      sessions,
      {} as DatabaseService,
      {} as EmailVerificationService
    );

    await expect(
      service.login({ email: "known@example.com", password: "wrong" })
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("creates a new session on successful login without revoking existing sessions", async () => {
    const user = {
      id: "c40b96ad-6035-4b0c-aa18-9ad901813a96",
      name: "Олена",
      emailNormalized: "known@example.com",
      passwordHash: "$argon2id$hashed"
    };
    const users = {
      findByNormalizedEmail: vi.fn().mockResolvedValue(user),
      toPublicUser: vi.fn().mockReturnValue({
        id: user.id,
        name: user.name,
        email: user.emailNormalized
      })
    } as unknown as UsersService;
    const passwords = {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
      burnUnknownPasswordCheck: vi.fn()
    } satisfies PasswordHasher;
    const session = {
      sessionSecret: "session-secret",
      csrfSecret: "csrf-secret",
      absoluteExpiresAt: new Date("2026-08-26T12:00:00.000Z")
    };
    const sessions = {
      createSession: vi.fn().mockResolvedValue(session),
      revoke: vi.fn()
    } as unknown as SessionService;
    const service = new AuthService(
      users,
      passwords,
      sessions,
      {} as DatabaseService,
      {} as EmailVerificationService
    );

    await expect(
      service.login({ email: "KNOWN@example.com", password: "Rooms123!" })
    ).resolves.toEqual({
      user: { id: user.id, name: user.name, email: user.emailNormalized },
      session
    });

    expect(passwords.verify).toHaveBeenCalledWith(
      "$argon2id$hashed",
      "Rooms123!"
    );
    expect(sessions.createSession).toHaveBeenCalledWith(user.id);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});

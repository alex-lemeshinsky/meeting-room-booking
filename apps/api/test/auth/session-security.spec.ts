import type { Clock } from "@mrb/time";
import type { ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard.js";
import { SessionGuard } from "../../src/auth/guards/session.guard.js";
import {
  CSRF_COOKIE,
  CookieService,
  SESSION_COOKIE
} from "../../src/auth/session/cookie.service.js";
import {
  createSecret,
  hashSecret,
  isMatchingSecret
} from "../../src/auth/session/session-crypto.js";
import { SessionService } from "../../src/auth/session/session.service.js";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("session secrets", () => {
  it("creates 32-byte base64url secrets and compares their SHA-256 hashes", () => {
    const secret = createSecret();
    const hash = hashSecret(secret);

    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(isMatchingSecret(secret, hash)).toBe(true);
    expect(isMatchingSecret("wrong", hash)).toBe(false);
    expect(isMatchingSecret(secret, "malformed")).toBe(false);
  });
});

describe("session cookies", () => {
  it("sets and clears scoped cookies without making CSRF HttpOnly", () => {
    const response = cookieResponse();
    const absoluteExpiresAt = new Date("2026-08-26T12:00:00.000Z");
    const cookies = new CookieService();

    cookies.setSessionCookies(
      response,
      {
        sessionSecret: "session-secret",
        csrfSecret: "csrf-secret"
      },
      absoluteExpiresAt
    );
    cookies.clearSessionCookies(response);

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      SESSION_COOKIE,
      "session-secret",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
        expires: absoluteExpiresAt
      })
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      CSRF_COOKIE,
      "csrf-secret",
      expect.objectContaining({
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: false,
        expires: absoluteExpiresAt
      })
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      CSRF_COOKIE,
      expect.objectContaining({ httpOnly: false, sameSite: "lax", path: "/" })
    );
  });

  it("uses Secure for both cookies in production", () => {
    process.env.NODE_ENV = "production";
    const response = cookieResponse();

    new CookieService().setSessionCookies(
      response,
      { sessionSecret: "session-secret", csrfSecret: "csrf-secret" },
      new Date("2026-08-26T12:00:00.000Z")
    );

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      SESSION_COOKIE,
      "session-secret",
      expect.objectContaining({ secure: true })
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      CSRF_COOKIE,
      "csrf-secret",
      expect.objectContaining({ secure: true })
    );
  });
});

describe("session authentication", () => {
  it("creates opaque secrets from the injected clock", async () => {
    const database = databaseWithSession();
    const service = new SessionService(database, fixedClock());

    const created = await service.createSession(
      "497f6eca-6276-4993-bfeb-53cbbbba6f08"
    );

    expect(database.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
        tokenHash: hashSecret(created.sessionSecret),
        csrfTokenHash: hashSecret(created.csrfSecret),
        lastSeenAt: NOW,
        idleExpiresAt: new Date("2026-08-03T12:00:00.000Z"),
        absoluteExpiresAt: new Date("2026-08-26T12:00:00.000Z")
      })
    });
    expect(created.absoluteExpiresAt.toISOString()).toBe(
      "2026-08-26T12:00:00.000Z"
    );
  });

  it("authenticates an active session and atomically caps its idle refresh", async () => {
    const secret = createSecret();
    const database = databaseWithSession({
      tokenHash: hashSecret(secret),
      idleExpiresAt: new Date("2026-08-01T12:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-08-02T12:00:00.000Z")
    });
    const service = new SessionService(database, fixedClock());

    await expect(service.authenticate(secret)).resolves.toEqual({
      user: {
        id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
        name: "Олена",
        email: "olena@example.com"
      },
      session: expect.objectContaining({
        id: "e40b96ad-6035-4b0c-aa18-9ad901813a96",
        absoluteExpiresAt: new Date("2026-08-02T12:00:00.000Z")
      })
    });
    expect(database.$executeRaw).toHaveBeenCalledOnce();
    const [query, ...parameters] = vi.mocked(database.$executeRaw).mock
      .calls[0]!;
    expect(Array.isArray(query) && "raw" in query).toBe(true);
    const normalizedSql = normalizeTaggedSql(query, parameters.length);
    expect(normalizedSql).toBe(
      [
        'UPDATE "sessions"',
        "SET",
        '"last_seen_at" = GREATEST("last_seen_at", $1),',
        '"idle_expires_at" = LEAST(',
        '"absolute_expires_at",',
        'GREATEST("idle_expires_at", $2)',
        ")",
        'WHERE "id" = $3::uuid',
        'AND "idle_expires_at" > $4',
        'AND "absolute_expires_at" > $5'
      ].join(" ")
    );
    expect(parameters).toEqual([
      NOW,
      new Date("2026-08-02T12:00:00.000Z"),
      "e40b96ad-6035-4b0c-aa18-9ad901813a96",
      NOW,
      NOW
    ]);
  });

  it("rejects a missing, expired, or concurrently invalidated session", async () => {
    const service = new SessionService(databaseWithSession(), fixedClock());
    await expect(service.authenticate(undefined)).rejects.toMatchObject({
      status: 401
    });

    const expired = databaseWithSession({
      idleExpiresAt: NOW,
      absoluteExpiresAt: new Date("2026-08-26T12:00:00.000Z")
    });
    await expect(
      new SessionService(expired, fixedClock()).authenticate(createSecret())
    ).rejects.toMatchObject({
      status: 401
    });

    const invalidated = databaseWithSession({ updateCount: 0 });
    await expect(
      new SessionService(invalidated, fixedClock()).authenticate(createSecret())
    ).rejects.toMatchObject({
      status: 401
    });
  });
});

describe("session and CSRF guards", () => {
  it("attaches the authenticated context from the session cookie", async () => {
    const authenticate = vi.fn().mockResolvedValue(authContext());
    const request = requestWith({ [SESSION_COOKIE]: "session-secret" });
    const guard = new SessionGuard({
      authenticate
    } as unknown as SessionService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toEqual(authContext());
  });

  it.each([
    [
      "a missing cookie",
      () =>
        requestWith({}, createSecret(), {
          csrfTokenHash: hashSecret(createSecret())
        })
    ],
    [
      "a missing header",
      () => {
        const secret = createSecret();
        return requestWith({ [CSRF_COOKIE]: secret }, undefined, {
          csrfTokenHash: hashSecret(secret)
        });
      }
    ],
    [
      "unequal raw values",
      () => {
        const cookieSecret = createSecret();
        return requestWith({ [CSRF_COOKIE]: cookieSecret }, createSecret(), {
          csrfTokenHash: hashSecret(cookieSecret)
        });
      }
    ],
    [
      "a malformed cookie",
      () => {
        const secret = createSecret();
        return requestWith({ [CSRF_COOKIE]: "not-a-token" }, secret, {
          csrfTokenHash: hashSecret(secret)
        });
      }
    ],
    [
      "a stored-hash mismatch",
      () => {
        const secret = createSecret();
        return requestWith({ [CSRF_COOKIE]: secret }, secret, {
          csrfTokenHash: hashSecret(createSecret())
        });
      }
    ]
  ])("rejects CSRF with %s", (_reason, createRequest) => {
    const request = createRequest();
    const guard = new CsrfGuard({
      getOrThrow: () => "http://127.0.0.1:3000"
    } as never);

    expect(() => guard.canActivate(contextFor(request))).toThrow(AppError);
  });

  it("accepts JSON from the app origin only when both CSRF values match the stored hash", () => {
    const secret = createSecret();
    const request = requestWith({ [CSRF_COOKIE]: secret }, secret, {
      csrfTokenHash: hashSecret(secret)
    });
    const guard = new CsrfGuard({
      getOrThrow: () => "http://127.0.0.1:3000"
    } as never);

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });
});

function fixedClock(): Clock {
  return { now: () => new Date(NOW) };
}

function normalizeTaggedSql(query: unknown, parameterCount: number): string {
  if (!Array.isArray(query) || !("raw" in query)) {
    throw new TypeError("Expected a tagged SQL template");
  }
  return query
    .map(
      (fragment, index) =>
        `${String(fragment)}${index < parameterCount ? `$${index + 1}` : ""}`
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function databaseWithSession(
  options: {
    tokenHash?: string;
    idleExpiresAt?: Date;
    absoluteExpiresAt?: Date;
    updateCount?: number;
  } = {}
): DatabaseService {
  return {
    $executeRaw: vi.fn().mockResolvedValue(options.updateCount ?? 1),
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        id: "e40b96ad-6035-4b0c-aa18-9ad901813a96",
        userId: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
        tokenHash: options.tokenHash ?? hashSecret(createSecret()),
        csrfTokenHash: hashSecret(createSecret()),
        lastSeenAt: new Date("2026-07-26T12:00:00.000Z"),
        idleExpiresAt:
          options.idleExpiresAt ?? new Date("2026-08-03T12:00:00.000Z"),
        absoluteExpiresAt:
          options.absoluteExpiresAt ?? new Date("2026-08-26T12:00:00.000Z"),
        createdAt: new Date("2026-07-26T12:00:00.000Z"),
        user: {
          id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
          name: "Олена",
          emailNormalized: "olena@example.com"
        }
      })
    }
  } as unknown as DatabaseService;
}

function cookieResponse(): Response & {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
} {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

function authContext(overrides = {}) {
  return {
    user: {
      id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
      name: "Олена",
      email: "olena@example.com"
    },
    session: {
      id: "e40b96ad-6035-4b0c-aa18-9ad901813a96",
      csrfTokenHash: hashSecret("csrf-secret"),
      absoluteExpiresAt: new Date("2026-08-26T12:00:00.000Z"),
      ...overrides
    }
  };
}

function requestWith(
  cookies: Record<string, string>,
  csrfHeader?: string,
  sessionOverrides = {}
): Request {
  const auth = authContext(sessionOverrides);
  return {
    auth,
    cookies,
    header: (name: string) => {
      if (name === "origin") return "http://127.0.0.1:3000";
      if (name === "x-csrf-token") return csrfHeader;
      return undefined;
    },
    is: (type: string) => type === "application/json"
  } as unknown as Request;
}

function contextFor(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

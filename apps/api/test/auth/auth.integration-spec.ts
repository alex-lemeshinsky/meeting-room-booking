import { DatabaseService } from "../../src/database/database.service.js";
import {
  createSecret,
  hashSecret
} from "../../src/auth/session/session-crypto.js";
import { SessionService } from "../../src/auth/session/session.service.js";
import {
  hashVerificationToken,
  type EmailVerificationTokenGenerator
} from "../../src/auth/email-verification/verification-token.js";
import { FixedClock, type Clock } from "@mrb/time";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_ORIGIN = "http://127.0.0.1:3000";
const INITIAL_TIME = new Date("2026-07-27T12:00:00.000Z");
const REGISTRATION_TIME = new Date("2026-08-01T09:00:00.000Z");
const REGISTERED_EMAIL = "unverified@example.com";

describe("POST /api/v1/auth/register", () => {
  let context: PostgresTestApp;
  let tokenGenerator: SequenceVerificationTokenGenerator;
  let registeredRawToken: string;
  let registeredUserId: string;

  beforeAll(async () => {
    tokenGenerator = new SequenceVerificationTokenGenerator();
    context = await startPostgresTestApp({
      seed: true,
      clock: new FixedClock(REGISTRATION_TIME),
      verificationTokenGenerator: tokenGenerator
    });
  }, 120_000);

  afterAll(async () => context.stop());

  it("creates a normalized user with an Argon2id password hash", async () => {
    const response = await request(context.app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", "http://127.0.0.1:3000")
      .send({
        name: "  Олена  ",
        email: " UNVERIFIED@example.com ",
        password: "Rooms123!"
      })
      .expect(201);

    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        name: "Олена",
        email: REGISTERED_EMAIL
      }
    });

    const database = context.app.get(DatabaseService);
    const user = await database.user.findUniqueOrThrow({
      where: { emailNormalized: REGISTERED_EMAIL }
    });
    registeredUserId = user.id;

    expect(user.name).toBe("Олена");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain("Rooms123!");
    expect(user.emailVerifiedAt).toBeNull();
    const rawToken = tokenGenerator.generated.at(-1);
    expect(rawToken).toBeDefined();
    if (!rawToken) throw new Error("Expected a generated verification token");
    registeredRawToken = rawToken;
    const token = await database.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash: hashVerificationToken(rawToken) }
    });
    expect(token.userId).toBe(user.id);
    expect(token.expiresAt.toISOString()).toBe("2026-08-02T09:00:00.000Z");
    expect(token.usedAt).toBeNull();
    expect(JSON.stringify(token)).not.toContain(rawToken);
    expect(await database.session.count()).toBe(0);
  });

  it("keeps login, session restoration, rooms, and schedules readable before verification", async () => {
    const server = context.app.getHttpServer();
    const agent = request.agent(server);
    await agent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: REGISTERED_EMAIL, password: "Rooms123!" })
      .expect(200);

    await agent.get("/api/v1/auth/session").expect(200);
    const rooms = await agent.get("/api/v1/rooms").expect(200);
    expect(rooms.body.rooms).toHaveLength(6);

    const database = context.app.get(DatabaseService);
    const seededBooking = await database.booking.findUniqueOrThrow({
      where: { id: "20000000-0000-4000-8000-000000000001" },
      select: { id: true, roomId: true, startAt: true, endAt: true }
    });
    const schedule = await agent
      .get(`/api/v1/rooms/${seededBooking.roomId}/schedule`)
      .query({
        from: new Date(
          seededBooking.startAt.getTime() - 30 * 60_000
        ).toISOString(),
        to: new Date(seededBooking.endAt.getTime() + 30 * 60_000).toISOString()
      })
      .expect(200);
    expect(schedule.body.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: seededBooking.id })
      ])
    );
  });

  it("rejects invalid input and duplicate emails with stable errors", async () => {
    const server = context.app.getHttpServer();
    const origin = { Origin: "http://127.0.0.1:3000" };

    await request(server)
      .post("/api/v1/auth/register")
      .set(origin)
      .send({ name: "Олена", email: "bad", password: "Rooms123!" })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toMatchObject({
          code: "VALIDATION_ERROR",
          fields: { email: ["Введіть коректний email"] }
        });
      });

    await request(server)
      .post("/api/v1/auth/register")
      .set(origin)
      .send({
        name: "Інша Олена",
        email: "UNVERIFIED@example.com",
        password: "Rooms123!"
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.error).toMatchObject({
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Email already registered",
          fields: { email: ["Обліковий запис із цим email уже існує"] }
        });
      });
  });

  it("rolls back user creation when token persistence fails", async () => {
    const database = context.app.get(DatabaseService);
    const existingUser = await database.user.findUniqueOrThrow({
      where: { emailNormalized: REGISTERED_EMAIL }
    });
    const collidingRawToken = tokenGenerator.peek();
    await database.emailVerificationToken.create({
      data: {
        userId: existingUser.id,
        tokenHash: hashVerificationToken(collidingRawToken),
        expiresAt: new Date("2026-08-02T09:00:00.000Z")
      }
    });

    await request(context.app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({
        name: "Відкочена Олена",
        email: "rollback@example.com",
        password: "Rooms123!"
      })
      .expect(500);

    expect(
      await database.user.findUnique({
        where: { emailNormalized: "rollback@example.com" }
      })
    ).toBeNull();
  });

  it("verifies an active token without creating a session or auth cookies", async () => {
    const database = context.app.get(DatabaseService);
    const sessionsBefore = await database.session.count();

    const response = await request(context.app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .send({ token: registeredRawToken })
      .expect(200);

    expect(response.body).toEqual({ verified: true });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(registeredRawToken);
    await expect(database.session.count()).resolves.toBe(sessionsBefore);
    await expect(
      database.emailVerificationToken.findUniqueOrThrow({
        where: { tokenHash: hashVerificationToken(registeredRawToken) },
        select: { usedAt: true }
      })
    ).resolves.toEqual({ usedAt: REGISTRATION_TIME });
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: registeredUserId },
        select: { emailVerifiedAt: true }
      })
    ).resolves.toEqual({ emailVerifiedAt: REGISTRATION_TIME });
  });

  it("returns stable errors for invalid, expired, and reused tokens", async () => {
    const database = context.app.get(DatabaseService);
    const expiredRawToken = "E".repeat(43);
    await database.emailVerificationToken.create({
      data: {
        userId: registeredUserId,
        tokenHash: hashVerificationToken(expiredRawToken),
        expiresAt: REGISTRATION_TIME
      }
    });
    const server = context.app.getHttpServer();

    const invalid = await request(server)
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .send({ token: "Z".repeat(43) })
      .expect(400);
    const expired = await request(server)
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .send({ token: expiredRawToken })
      .expect(410);
    const reused = await request(server)
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .send({ token: registeredRawToken })
      .expect(409);

    expect(invalid.body.error).toMatchObject({
      code: "EMAIL_VERIFICATION_TOKEN_INVALID",
      requestId: expect.any(String)
    });
    expect(expired.body.error).toMatchObject({
      code: "EMAIL_VERIFICATION_TOKEN_EXPIRED",
      requestId: expect.any(String)
    });
    expect(reused.body.error).toMatchObject({
      code: "EMAIL_VERIFICATION_TOKEN_USED",
      requestId: expect.any(String)
    });
  });

  it("requires an accepted Origin and JSON content type", async () => {
    const server = context.app.getHttpServer();

    await request(server)
      .post("/api/v1/auth/verify-email")
      .send({ token: "Z".repeat(43) })
      .expect(403);
    await request(server)
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .expect(415);
  });

  it.each([
    "",
    "short",
    "A".repeat(44),
    `${"A".repeat(42)} `,
    `${"A".repeat(42)}+`
  ])("rejects malformed verification token %#", async (token) => {
    const response = await request(context.app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .set("Origin", APP_ORIGIN)
      .send({ token })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { token: expect.any(Array) },
      requestId: expect.any(String)
    });
  });

  it("allows exactly one of two concurrent requests to consume a token", async () => {
    const generatedBefore = tokenGenerator.generated.length;
    await request(context.app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({
        name: "Конкурентна Олена",
        email: "concurrent-verification@example.com",
        password: "Rooms123!"
      })
      .expect(201);
    const rawToken = tokenGenerator.generated[generatedBefore];
    if (!rawToken) throw new Error("Expected a concurrent verification token");

    const responses = await Promise.all([
      request(context.app.getHttpServer())
        .post("/api/v1/auth/verify-email")
        .set("Origin", APP_ORIGIN)
        .send({ token: rawToken }),
      request(context.app.getHttpServer())
        .post("/api/v1/auth/verify-email")
        .set("Origin", APP_ORIGIN)
        .send({ token: rawToken })
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      responses.find(({ status }) => status === 409)?.body.error
    ).toMatchObject({ code: "EMAIL_VERIFICATION_TOKEN_USED" });
    const database = context.app.get(DatabaseService);
    await expect(
      database.emailVerificationToken.findUniqueOrThrow({
        where: { tokenHash: hashVerificationToken(rawToken) },
        select: { usedAt: true, user: { select: { emailVerifiedAt: true } } }
      })
    ).resolves.toEqual({
      usedAt: REGISTRATION_TIME,
      user: { emailVerifiedAt: REGISTRATION_TIME }
    });
  });
});

describe("authentication session lifecycle", () => {
  let context: PostgresTestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(INITIAL_TIME);
    context = await startPostgresTestApp({ clock });
  }, 120_000);

  afterAll(async () => context.stop());

  it("returns indistinguishable failures for unknown and wrong credentials", async () => {
    const server = context.app.getHttpServer();
    await register(server, "known@example.com");

    const unknown = await request(server)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "missing@example.com", password: "wrong" });
    const wrongPassword = await request(server)
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "known@example.com", password: "wrong" });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(errorIdentity(unknown.body)).toEqual(
      errorIdentity(wrongPassword.body)
    );
  });

  it("logs in, keeps opaque values out of storage, and restores the session", async () => {
    const server = context.app.getHttpServer();
    const agent = request.agent(server);
    await register(server, "olena@example.com");

    const login = await agent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "olena@example.com", password: "Rooms123!" })
      .expect(200);

    expect(login.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("mrb_session="),
        expect.stringContaining("mrb_csrf=")
      ])
    );
    const sessionCookie = cookie(login, "mrb_session");
    const csrfCookie = cookie(login, "mrb_csrf");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("Path=/");
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie).toContain("SameSite=Lax");
    expect(csrfCookie).toContain("Path=/");

    const database = context.app.get(DatabaseService);
    const session = await database.session.findFirstOrThrow({
      where: { user: { emailNormalized: "olena@example.com" } }
    });
    expect(session.tokenHash).not.toContain(cookieValue(sessionCookie));
    expect(session.csrfTokenHash).not.toContain(cookieValue(csrfCookie));
    expect(session.idleExpiresAt.toISOString()).toBe(
      "2026-08-03T12:00:00.000Z"
    );
    expect(session.absoluteExpiresAt.toISOString()).toBe(
      "2026-08-26T12:00:00.000Z"
    );

    const restored = await agent.get("/api/v1/auth/session").expect(200);
    expect(restored.body).toEqual({
      user: {
        id: expect.any(String),
        name: "Олена",
        email: "olena@example.com"
      }
    });
  });

  it("caps a sliding idle expiry at the absolute deadline", async () => {
    const server = context.app.getHttpServer();
    const agent = request.agent(server);
    clock.set(INITIAL_TIME);
    await register(server, "sliding@example.com");
    await agent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "sliding@example.com", password: "Rooms123!" })
      .expect(200);

    clock.set(new Date("2026-08-01T12:00:00.000Z"));
    await agent.get("/api/v1/auth/session").expect(200);
    clock.set(new Date("2026-08-07T12:00:00.000Z"));
    await agent.get("/api/v1/auth/session").expect(200);
    clock.set(new Date("2026-08-13T12:00:00.000Z"));
    await agent.get("/api/v1/auth/session").expect(200);
    clock.set(new Date("2026-08-19T12:00:00.000Z"));
    await agent.get("/api/v1/auth/session").expect(200);
    clock.set(new Date("2026-08-22T12:00:00.000Z"));
    await agent.get("/api/v1/auth/session").expect(200);

    const database = context.app.get(DatabaseService);
    const session = await database.session.findFirstOrThrow({
      where: { user: { emailNormalized: "sliding@example.com" } }
    });
    expect(session.idleExpiresAt.toISOString()).toBe(
      "2026-08-26T12:00:00.000Z"
    );
  });

  it("keeps session refresh timestamps monotonic when older work commits last", async () => {
    const database = context.app.get(DatabaseService);
    const sessionSecret = createSecret();
    const user = await database.user.create({
      data: {
        name: "Конкурентна Олена",
        emailNormalized: "concurrent-session@example.com",
        passwordHash: "not-used-by-this-session-test"
      }
    });
    const session = await database.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(sessionSecret),
        csrfTokenHash: hashSecret(createSecret()),
        lastSeenAt: new Date("2026-07-27T12:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-03T12:00:00.000Z"),
        absoluteExpiresAt: new Date("2026-08-26T12:00:00.000Z")
      }
    });
    const olderNow = new Date("2026-07-28T12:00:00.000Z");
    const newerNow = new Date("2026-07-29T12:00:00.000Z");
    const olderMutation = blockNextSessionMutation(database);
    const older = new SessionService(
      olderMutation.database,
      clockAt(olderNow)
    ).authenticate(sessionSecret);

    await olderMutation.reached;
    const newerOutcome = await settle(
      new SessionService(database, clockAt(newerNow)).authenticate(
        sessionSecret
      )
    );
    olderMutation.release();
    const olderOutcome = await settle(older);

    expect(newerOutcome).toMatchObject({
      status: "fulfilled",
      value: { session: { id: session.id } }
    });
    expect(olderOutcome).toMatchObject({
      status: "fulfilled",
      value: { session: { id: session.id } }
    });
    const refreshed = await database.session.findUniqueOrThrow({
      where: { id: session.id }
    });
    expect(refreshed.lastSeenAt.toISOString()).toBe("2026-07-29T12:00:00.000Z");
    expect(refreshed.idleExpiresAt.toISOString()).toBe(
      "2026-08-05T12:00:00.000Z"
    );
  });

  it("rejects missing, idle-expired, and absolute-expired sessions", async () => {
    const server = context.app.getHttpServer();
    const database = context.app.get(DatabaseService);
    await request(server).get("/api/v1/auth/session").expect(401);

    const idleAgent = request.agent(server);
    clock.set(INITIAL_TIME);
    await register(server, "idle@example.com");
    await idleAgent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "idle@example.com", password: "Rooms123!" })
      .expect(200);
    clock.set(new Date("2026-08-03T12:00:00.000Z"));
    await idleAgent.get("/api/v1/auth/session").expect(401);

    const absoluteAgent = request.agent(server);
    clock.set(INITIAL_TIME);
    await register(server, "absolute@example.com");
    const absoluteLogin = await absoluteAgent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "absolute@example.com", password: "Rooms123!" })
      .expect(200);
    await database.session.updateMany({
      where: {
        tokenHash: hashSecret(cookieValue(cookie(absoluteLogin, "mrb_session")))
      },
      data: { idleExpiresAt: new Date("2026-08-30T12:00:00.000Z") }
    });
    clock.set(new Date("2026-08-26T12:00:00.000Z"));
    await absoluteAgent.get("/api/v1/auth/session").expect(401);
  });

  it("requires matching CSRF credentials to logout only the current session", async () => {
    const server = context.app.getHttpServer();
    const currentAgent = request.agent(server);
    const otherAgent = request.agent(server);
    clock.set(INITIAL_TIME);
    await register(server, "logout@example.com");
    const currentLogin = await currentAgent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "logout@example.com", password: "Rooms123!" })
      .expect(200);
    await otherAgent
      .post("/api/v1/auth/login")
      .set("Origin", APP_ORIGIN)
      .send({ email: "logout@example.com", password: "Rooms123!" })
      .expect(200);

    await currentAgent
      .post("/api/v1/auth/logout")
      .set("Origin", APP_ORIGIN)
      .send({})
      .expect(403);
    await currentAgent
      .post("/api/v1/auth/logout")
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send({})
      .expect(403);

    const logout = await currentAgent
      .post("/api/v1/auth/logout")
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", cookieValue(cookie(currentLogin, "mrb_csrf")))
      .send({})
      .expect(204);

    expect(logout.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("mrb_session=;"),
        expect.stringContaining("mrb_csrf=;")
      ])
    );
    const database = context.app.get(DatabaseService);
    expect(
      await database.session.count({
        where: { user: { emailNormalized: "logout@example.com" } }
      })
    ).toBe(1);
    await otherAgent.get("/api/v1/auth/session").expect(200);
  });
});

async function register(
  server: Parameters<typeof request>[0],
  email: string
): Promise<void> {
  await request(server)
    .post("/api/v1/auth/register")
    .set("Origin", APP_ORIGIN)
    .send({ name: "Олена", email, password: "Rooms123!" })
    .expect(201);
}

function cookie(response: request.Response, name: string): string {
  const setCookie = response.headers["set-cookie"];
  const cookieHeaders = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const value = cookieHeaders.find((item) => item.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

function cookieValue(cookieHeader: string): string {
  return cookieHeader.slice(
    cookieHeader.indexOf("=") + 1,
    cookieHeader.indexOf(";")
  );
}

function errorIdentity(body: { error?: { code?: string; message?: string } }): {
  code: string | undefined;
  message: string | undefined;
} {
  return { code: body.error?.code, message: body.error?.message };
}

function clockAt(now: Date): Clock {
  return { now: () => new Date(now) };
}

function blockNextSessionMutation(database: DatabaseService): {
  database: DatabaseService;
  reached: Promise<void>;
  release(): void;
} {
  let markReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let blocked = false;
  const pauseOnce = async <T>(mutation: () => Promise<T>): Promise<T> => {
    if (!blocked) {
      blocked = true;
      markReached();
      await released;
    }
    return mutation();
  };
  const session = new Proxy(database.session, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "updateMany") {
        return (...args: unknown[]) =>
          pauseOnce(() =>
            Reflect.apply(
              value as (...parameters: unknown[]) => Promise<unknown>,
              target,
              args
            )
          );
      }
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const executeRaw = database.$executeRaw.bind(database);
  const blockingDatabase = {
    session,
    $executeRaw: (...args: unknown[]) =>
      pauseOnce(() =>
        Reflect.apply(
          executeRaw as (...parameters: unknown[]) => Promise<number>,
          database,
          args
        )
      )
  } as unknown as DatabaseService;

  return { database: blockingDatabase, reached, release };
}

async function settle<T>(
  promise: Promise<T>
): Promise<
  { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }
> {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

class SequenceVerificationTokenGenerator implements EmailVerificationTokenGenerator {
  readonly generated: string[] = [];
  private index = 0;

  generate(): string {
    const token = this.tokenAt(this.index);
    this.index += 1;
    this.generated.push(token);
    return token;
  }

  peek(): string {
    return this.tokenAt(this.index);
  }

  private tokenAt(index: number): string {
    return String.fromCharCode("A".charCodeAt(0) + index).repeat(43);
  }
}

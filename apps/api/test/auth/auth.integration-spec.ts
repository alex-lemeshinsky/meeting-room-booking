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

describe("POST /api/v1/auth/register", () => {
  let context: PostgresTestApp;
  let tokenGenerator: SequenceVerificationTokenGenerator;

  beforeAll(async () => {
    tokenGenerator = new SequenceVerificationTokenGenerator();
    context = await startPostgresTestApp({
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
        email: " OLENA@example.com ",
        password: "Rooms123!"
      })
      .expect(201);

    expect(response.body).toEqual({
      user: {
        id: expect.any(String),
        name: "Олена",
        email: "olena@example.com"
      }
    });

    const database = context.app.get(DatabaseService);
    const user = await database.user.findUniqueOrThrow({
      where: { emailNormalized: "olena@example.com" }
    });

    expect(user.name).toBe("Олена");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain("Rooms123!");
    expect(user.emailVerifiedAt).toBeNull();
    const rawToken = tokenGenerator.generated.at(-1);
    expect(rawToken).toBeDefined();
    const token = await database.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash: hashVerificationToken(rawToken ?? "") }
    });
    expect(token.userId).toBe(user.id);
    expect(token.expiresAt.toISOString()).toBe("2026-08-02T09:00:00.000Z");
    expect(token.usedAt).toBeNull();
    expect(JSON.stringify(token)).not.toContain(rawToken);
    expect(await database.session.count()).toBe(0);
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
        email: "OLENA@example.com",
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
      where: { emailNormalized: "olena@example.com" }
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

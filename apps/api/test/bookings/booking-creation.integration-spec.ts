import { FixedClock } from "@mrb/time";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";

describe("POST /api/v1/bookings", () => {
  let context: PostgresTestApp;
  let olena: AuthenticatedAgent;
  let alex: AuthenticatedAgent;

  beforeAll(async () => {
    context = await startPostgresTestApp({
      seed: true,
      clock: new FixedClock(new Date("2035-01-15T06:00:00.000Z"))
    });
    olena = await login(context, "olena@example.com", "Rooms123!");
    alex = await login(context, "alex@example.com", "Meeting123!");
  }, 120_000);

  afterAll(async () => context.stop());

  it("requires both an authenticated session and a matching CSRF token", async () => {
    const payload = validPayload("2035-01-15T07:00:00.000Z");
    await request(context.app.getHttpServer())
      .post("/api/v1/bookings")
      .set("Origin", APP_ORIGIN)
      .send(payload)
      .expect(401);

    await olena.agent
      .post("/api/v1/bookings")
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send(payload)
      .expect(403);
  });

  it("rejects malformed instants at the HTTP boundary", async () => {
    const response = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      startAt: "2035-01-15T09:00:00+02:00"
    }).expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fields: { startAt: expect.any(Array) }
      }
    });
  });

  it("rejects domain-invalid input and a missing room with stable errors", async () => {
    const past = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      startAt: "2035-01-15T06:00:00.000Z",
      endAt: "2035-01-15T06:30:00.000Z"
    }).expect(400);
    expect(past.body.error).toMatchObject({
      code: "BOOKING_NOT_IN_FUTURE",
      fields: { startAt: expect.any(Array) }
    });

    const missing = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      roomId: "10000000-0000-4000-8000-999999999999"
    }).expect(404);
    expect(missing.body.error).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("allows a verified seeded user to create a trimmed one-off booking", async () => {
    const database = context.app.get(DatabaseService);
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: OLENA_ID },
        select: { emailVerifiedAt: true }
      })
    ).resolves.toEqual({ emailVerifiedAt: expect.any(Date) });

    const response = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      title: "  Командне планування  "
    }).expect(201);

    expect(response.body).toEqual({
      booking: {
        id: expect.any(String),
        roomId: ROOM_ID,
        title: "Командне планування",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      }
    });
    await expect(
      database.booking.findUniqueOrThrow({
        where: { id: response.body.booking.id },
        select: {
          roomId: true,
          userId: true,
          title: true,
          startAt: true,
          endAt: true,
          status: true
        }
      })
    ).resolves.toEqual({
      roomId: ROOM_ID,
      userId: OLENA_ID,
      title: "Командне планування",
      startAt: new Date("2035-01-15T07:00:00.000Z"),
      endAt: new Date("2035-01-15T07:30:00.000Z"),
      status: "ACTIVE"
    });
  });

  it("rejects a newly registered unverified user without creating a booking, then allows a verified retry", async () => {
    const database = context.app.get(DatabaseService);
    const email = "unverified-booker@example.com";
    await request(context.app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({ name: "Unverified Booker", email, password: "Rooms123!" })
      .expect(201);
    const user = await database.user.findUniqueOrThrow({
      where: { emailNormalized: email },
      select: { id: true, emailVerifiedAt: true }
    });
    expect(user.emailVerifiedAt).toBeNull();
    const unverified = await login(context, email, "Rooms123!");
    const payload = validPayload("2035-01-15T12:00:00.000Z");

    const rejected = await create(unverified, payload).expect(403);
    expect(rejected.body.error).toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
      message: "Email verification is required"
    });
    await expect(
      database.booking.count({ where: { userId: user.id } })
    ).resolves.toBe(0);

    await database.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date("2035-01-15T06:00:00.000Z") }
    });

    await create(unverified, payload).expect(201);
  });

  it("maps an existing active overlap to BOOKING_CONFLICT", async () => {
    const database = context.app.get(DatabaseService);
    await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: OLENA_ID,
        title: "Existing",
        startAt: new Date("2035-01-15T08:00:00.000Z"),
        endAt: new Date("2035-01-15T09:00:00.000Z")
      }
    });

    const response = await create(
      alex,
      validPayload("2035-01-15T08:30:00.000Z")
    ).expect(409);

    expect(response.body.error).toMatchObject({
      code: "BOOKING_CONFLICT",
      fields: {
        startAt: expect.any(Array),
        endAt: expect.any(Array)
      }
    });
  });

  it("allows only one of two concurrent requests for the same interval", async () => {
    const database = context.app.get(DatabaseService);
    const payload = validPayload("2035-01-15T10:00:00.000Z");

    const responses = await Promise.all([
      create(olena, { ...payload, title: "Olena race" }),
      create(alex, { ...payload, title: "Alex race" })
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      responses.find(({ status }) => status === 409)?.body.error.code
    ).toBe("BOOKING_CONFLICT");
    await expect(
      database.booking.count({
        where: {
          roomId: ROOM_ID,
          status: "ACTIVE",
          startAt: { lt: new Date(payload.endAt) },
          endAt: { gt: new Date(payload.startAt) },
          userId: { in: [OLENA_ID, ALEX_ID] }
        }
      })
    ).resolves.toBe(1);
  });
});

interface AuthenticatedAgent {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
}

async function login(
  context: PostgresTestApp,
  email: string,
  password: string
): Promise<AuthenticatedAgent> {
  const agent = request.agent(context.app.getHttpServer());
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", APP_ORIGIN)
    .send({ email, password })
    .expect(200);

  return {
    agent,
    csrfToken: cookieValue(cookie(response, "mrb_csrf"))
  };
}

function create(
  authenticated: AuthenticatedAgent,
  payload: ReturnType<typeof validPayload>
) {
  return authenticated.agent
    .post("/api/v1/bookings")
    .set("Origin", APP_ORIGIN)
    .set("X-CSRF-Token", authenticated.csrfToken)
    .send(payload);
}

function validPayload(startAt: string) {
  return {
    roomId: ROOM_ID,
    title: "Планування",
    startAt,
    endAt: new Date(new Date(startAt).getTime() + 30 * 60 * 1_000).toISOString()
  };
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

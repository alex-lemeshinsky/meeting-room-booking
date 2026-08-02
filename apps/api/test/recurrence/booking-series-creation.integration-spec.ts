import { FixedClock } from "@mrb/time";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";

describe("POST /api/v1/booking-series", () => {
  let context: PostgresTestApp;
  let database: DatabaseService;
  let olena: AuthenticatedAgent;
  let alex: AuthenticatedAgent;

  beforeAll(async () => {
    context = await startPostgresTestApp({
      seed: true,
      clock: new FixedClock(new Date("2035-01-01T00:00:00.000Z"))
    });
    database = context.app.get(DatabaseService);
    olena = await login(context, "olena@example.com", "Rooms123!");
    alex = await login(context, "alex@example.com", "Meeting123!");
  }, 120_000);

  beforeEach(async () => {
    await database.booking.deleteMany();
    await database.bookingSeries.deleteMany();
  });

  afterAll(async () => context.stop());

  it("requires an authenticated session and matching CSRF token", async () => {
    const payload = validPayload("2035-01-15T07:00:00.000Z");

    await request(context.app.getHttpServer())
      .post("/api/v1/booking-series")
      .set("Origin", APP_ORIGIN)
      .send(payload)
      .expect(401);

    await olena.agent
      .post("/api/v1/booking-series")
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send(payload)
      .expect(403);
  });

  it.each([1, 53, 2.5])(
    "rejects occurrenceCount %s at the HTTP boundary",
    async (occurrenceCount) => {
      const response = await create(olena, {
        ...validPayload("2035-01-15T07:00:00.000Z"),
        occurrenceCount
      }).expect(400);

      expect(response.body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: { occurrenceCount: expect.any(Array) }
      });
    }
  );

  it("rejects malformed UTC instants at the HTTP boundary", async () => {
    const response = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      startAt: "2035-01-15T09:00:00+02:00"
    }).expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { startAt: expect.any(Array) }
    });
  });

  it("rejects an unverified user and a missing room before persistence", async () => {
    const email = "unverified-series@example.com";
    await request(context.app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", APP_ORIGIN)
      .send({ name: "Unverified Series", email, password: "Rooms123!" })
      .expect(201);
    const user = await database.user.findUniqueOrThrow({
      where: { emailNormalized: email },
      select: { id: true }
    });
    const unverified = await login(context, email, "Rooms123!");

    const rejected = await create(
      unverified,
      validPayload("2035-01-15T07:00:00.000Z")
    ).expect(403);
    expect(rejected.body.error).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    const missing = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      roomId: "10000000-0000-4000-8000-999999999999"
    }).expect(404);
    expect(missing.body.error).toMatchObject({ code: "ROOM_NOT_FOUND" });

    await expect(
      database.bookingSeries.count({ where: { userId: user.id } })
    ).resolves.toBe(0);
    await expect(
      database.bookingSeries.count({ where: { userId: OLENA_ID } })
    ).resolves.toBe(0);
  });

  it("creates a trimmed weekly series and ordered materialized occurrences", async () => {
    const response = await create(olena, {
      ...validPayload("2035-01-15T07:00:00.000Z"),
      title: "  Щотижнева синхронізація  "
    }).expect(201);

    expect(response.body.series).toMatchObject({
      roomId: ROOM_ID,
      title: "Щотижнева синхронізація",
      officeTimezone: "Europe/Kyiv",
      occurrenceCount: 3,
      rule: "WEEKLY"
    });
    expect(
      response.body.occurrences.map(
        ({ occurrenceIndex }: { occurrenceIndex: number }) => occurrenceIndex
      )
    ).toEqual([0, 1, 2]);
    expect(response.body.occurrences).toEqual([
      expect.objectContaining({
        occurrenceIndex: 0,
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      }),
      expect.objectContaining({
        occurrenceIndex: 1,
        startAt: "2035-01-22T07:00:00.000Z",
        endAt: "2035-01-22T07:30:00.000Z"
      }),
      expect.objectContaining({
        occurrenceIndex: 2,
        startAt: "2035-01-29T07:00:00.000Z",
        endAt: "2035-01-29T07:30:00.000Z"
      })
    ]);

    await expect(
      database.bookingSeries.findUniqueOrThrow({
        where: { id: response.body.series.id },
        select: {
          userId: true,
          roomId: true,
          title: true,
          officeTimezone: true,
          firstLocalDate: true,
          firstLocalStartTime: true,
          durationMinutes: true,
          occurrenceCount: true,
          rule: true,
          bookings: {
            orderBy: { occurrenceIndex: "asc" },
            select: { occurrenceIndex: true }
          }
        }
      })
    ).resolves.toEqual({
      userId: OLENA_ID,
      roomId: ROOM_ID,
      title: "Щотижнева синхронізація",
      officeTimezone: "Europe/Kyiv",
      firstLocalDate: new Date("2035-01-15T00:00:00.000Z"),
      firstLocalStartTime: new Date("1970-01-01T09:00:00.000Z"),
      durationMinutes: 30,
      occurrenceCount: 3,
      rule: "WEEKLY",
      bookings: [
        { occurrenceIndex: 0 },
        { occurrenceIndex: 1 },
        { occurrenceIndex: 2 }
      ]
    });
  });

  it("rolls back the whole series and reports a conflict at occurrence 3", async () => {
    const title = "Серія з пізнім конфліктом";
    const conflictingStart = "2035-02-19T07:00:00.000Z";
    const conflictingEnd = "2035-02-19T07:30:00.000Z";
    await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: ALEX_ID,
        title: "Existing third occurrence",
        startAt: new Date(conflictingStart),
        endAt: new Date(conflictingEnd)
      }
    });

    const response = await create(olena, {
      ...validPayload("2035-02-05T07:00:00.000Z"),
      title
    }).expect(409);

    expect(response.body.error).toMatchObject({
      code: "BOOKING_CONFLICT",
      details: {
        occurrenceNumber: 3,
        startAt: conflictingStart,
        endAt: conflictingEnd
      }
    });
    await expect(
      database.bookingSeries.count({ where: { title } })
    ).resolves.toBe(0);
    await expect(database.booking.count({ where: { title } })).resolves.toBe(0);
  });

  it("commits only one winner when two series race on their first occurrence", async () => {
    const payload = validPayload("2035-05-07T07:00:00.000Z");
    const titles = ["Olena recurring race", "Alex recurring race"];

    const responses = await Promise.all([
      create(olena, { ...payload, title: titles[0]! }),
      create(alex, { ...payload, title: titles[1]! })
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      responses.find(({ status }) => status === 409)?.body.error
    ).toMatchObject({
      code: "BOOKING_CONFLICT",
      details: {
        occurrenceNumber: 1,
        startAt: payload.startAt,
        endAt: payload.endAt
      }
    });
    await expect(
      database.bookingSeries.count({ where: { title: { in: titles } } })
    ).resolves.toBe(1);
    await expect(
      database.booking.count({ where: { title: { in: titles } } })
    ).resolves.toBe(3);
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
    .post("/api/v1/booking-series")
    .set("Origin", APP_ORIGIN)
    .set("X-CSRF-Token", authenticated.csrfToken)
    .send(payload);
}

function validPayload(startAt: string) {
  return {
    roomId: ROOM_ID,
    title: "Щотижневе планування",
    startAt,
    endAt: new Date(
      new Date(startAt).getTime() + 30 * 60 * 1_000
    ).toISOString(),
    occurrenceCount: 3
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

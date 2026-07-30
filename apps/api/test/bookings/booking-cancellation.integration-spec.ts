import { FixedClock } from "@mrb/time";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const NOW = new Date("2035-01-15T08:17:00.000Z");
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";

describe("POST /api/v1/bookings/:bookingId/cancel", () => {
  let context: PostgresTestApp;
  let database: DatabaseService;
  let olena: AuthenticatedAgent;

  beforeAll(async () => {
    context = await startPostgresTestApp({
      seed: true,
      clock: new FixedClock(NOW)
    });
    database = context.app.get(DatabaseService);
    olena = await login(context, "olena@example.com", "Rooms123!");
  }, 120_000);

  beforeEach(async () => {
    await database.booking.deleteMany();
  });

  afterAll(async () => context.stop());

  it("requires an authenticated session and matching CSRF token", async () => {
    const booking = await insertBooking({
      userId: OLENA_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z"
    });

    await request(context.app.getHttpServer())
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set("Origin", APP_ORIGIN)
      .send({})
      .expect(401);

    await olena.agent
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send({})
      .expect(403);
  });

  it("soft-cancels an owned future booking at the server clock", async () => {
    const booking = await insertBooking({
      userId: OLENA_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z"
    });

    const response = await cancel(olena, booking.id).expect(200);

    expect(response.body).toEqual({
      booking: {
        id: booking.id,
        status: "CANCELLED",
        cancelledAt: NOW.toISOString()
      }
    });
    await expect(
      database.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual({
      status: "CANCELLED",
      cancelledAt: NOW
    });
  });

  it("rejects cancellation of another user's booking without changing it", async () => {
    const booking = await insertBooking({
      userId: ALEX_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z"
    });

    const response = await cancel(olena, booking.id).expect(403);

    expect(response.body.error.code).toBe("BOOKING_FORBIDDEN");
    await expect(
      database.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual({ status: "ACTIVE", cancelledAt: null });
  });

  it("rejects completed and repeated cancellation commands", async () => {
    const completed = await insertBooking({
      userId: OLENA_ID,
      startAt: "2035-01-15T07:00:00.000Z",
      endAt: NOW.toISOString()
    });
    const future = await insertBooking({
      userId: OLENA_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z"
    });

    const completedResponse = await cancel(olena, completed.id).expect(409);
    expect(completedResponse.body.error.code).toBe("BOOKING_ALREADY_ENDED");

    await cancel(olena, future.id).expect(200);
    const repeatedResponse = await cancel(olena, future.id).expect(409);
    expect(repeatedResponse.body.error.code).toBe("BOOKING_ALREADY_CANCELLED");
  });

  it("releases an active interval for the next future grid boundary", async () => {
    const active = await insertBooking({
      userId: OLENA_ID,
      startAt: "2035-01-15T08:00:00.000Z",
      endAt: "2035-01-15T10:00:00.000Z"
    });

    await cancel(olena, active.id).expect(200);
    const created = await olena.agent
      .post("/api/v1/bookings")
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", olena.csrfToken)
      .send({
        roomId: ROOM_ID,
        title: "Після скасування",
        startAt: "2035-01-15T08:30:00.000Z",
        endAt: "2035-01-15T09:00:00.000Z"
      })
      .expect(201);

    await expect(
      database.booking.count({
        where: {
          roomId: ROOM_ID,
          status: "ACTIVE",
          startAt: { lt: new Date("2035-01-15T09:00:00.000Z") },
          endAt: { gt: new Date("2035-01-15T08:30:00.000Z") }
        }
      })
    ).resolves.toBe(1);
    expect(created.body.booking.title).toBe("Після скасування");
  });

  async function insertBooking(input: {
    userId: string;
    startAt: string;
    endAt: string;
  }) {
    return database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: input.userId,
        title: "Тестове бронювання",
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt)
      }
    });
  }
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

function cancel(authenticated: AuthenticatedAgent, bookingId: string) {
  return authenticated.agent
    .post(`/api/v1/bookings/${bookingId}/cancel`)
    .set("Origin", APP_ORIGIN)
    .set("X-CSRF-Token", authenticated.csrfToken)
    .send({});
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

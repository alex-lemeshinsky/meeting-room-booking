import { FixedClock } from "@mrb/time";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const NOW = new Date("2035-01-15T08:17:00.000Z");
const PREVIOUSLY_CANCELLED_AT = new Date("2035-01-14T12:00:00.000Z");
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";

describe("POST /api/v1/booking-series/:seriesId/cancel", () => {
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
    await database.bookingSeries.deleteMany();
  });

  afterAll(async () => context.stop());

  it("requires an authenticated session and matching CSRF token", async () => {
    const series = await insertSeries({
      userId: OLENA_ID,
      occurrences: [futureOccurrence(0), futureOccurrence(1)]
    });

    await request(context.app.getHttpServer())
      .post(`/api/v1/booking-series/${series.id}/cancel`)
      .set("Origin", APP_ORIGIN)
      .send({})
      .expect(401);

    await olena.agent
      .post(`/api/v1/booking-series/${series.id}/cancel`)
      .set("Origin", APP_ORIGIN)
      .set("X-CSRF-Token", "wrong")
      .send({})
      .expect(403);
  });

  it("cancels active and future siblings with one timestamp while preserving history", async () => {
    const series = await insertSeries({
      userId: OLENA_ID,
      occurrences: [
        {
          occurrenceIndex: 0,
          title: "Completed sibling",
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T08:00:00.000Z"
        },
        {
          occurrenceIndex: 1,
          title: "Earlier active sibling",
          startAt: "2035-01-15T08:00:00.000Z",
          endAt: "2035-01-15T09:00:00.000Z"
        },
        futureOccurrence(2),
        {
          occurrenceIndex: 3,
          title: "Previously cancelled sibling",
          startAt: "2035-01-15T11:00:00.000Z",
          endAt: "2035-01-15T11:30:00.000Z",
          status: "CANCELLED",
          cancelledAt: PREVIOUSLY_CANCELLED_AT
        }
      ]
    });
    const selectedMiddleOccurrence = await database.booking.findFirstOrThrow({
      where: { seriesId: series.id, occurrenceIndex: 2 },
      select: { seriesId: true }
    });

    const response = await cancel(
      olena,
      selectedMiddleOccurrence.seriesId!
    ).expect(200);

    expect(response.body).toEqual({
      series: {
        id: series.id,
        status: "CANCELLED",
        cancelledAt: NOW.toISOString(),
        cancelledCount: 2
      }
    });
    await expect(
      database.booking.findMany({
        where: { seriesId: series.id },
        orderBy: { occurrenceIndex: "asc" },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual([
      { status: "ACTIVE", cancelledAt: null },
      { status: "CANCELLED", cancelledAt: NOW },
      { status: "CANCELLED", cancelledAt: NOW },
      { status: "CANCELLED", cancelledAt: PREVIOUSLY_CANCELLED_AT }
    ]);
  });

  it("returns stable errors for malformed, missing, forbidden, and exhausted series", async () => {
    const malformed = await cancel(olena, "not-a-uuid").expect(400);
    expect(malformed.body.error.code).toBe("HTTP_ERROR");

    const missing = await cancel(
      olena,
      "ffffffff-ffff-4fff-8fff-ffffffffffff"
    ).expect(404);
    expect(missing.body.error.code).toBe("BOOKING_SERIES_NOT_FOUND");

    const foreign = await insertSeries({
      userId: ALEX_ID,
      occurrences: [futureOccurrence(0), futureOccurrence(1)]
    });
    const forbidden = await cancel(olena, foreign.id).expect(403);
    expect(forbidden.body.error.code).toBe("BOOKING_SERIES_FORBIDDEN");

    const exhausted = await insertSeries({
      userId: OLENA_ID,
      occurrences: [
        {
          occurrenceIndex: 0,
          title: "Completed",
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T08:00:00.000Z"
        },
        {
          ...futureOccurrence(1),
          status: "CANCELLED",
          cancelledAt: PREVIOUSLY_CANCELLED_AT
        }
      ]
    });
    const notCancellable = await cancel(olena, exhausted.id).expect(409);
    expect(notCancellable.body.error.code).toBe("SERIES_NOT_CANCELLABLE");

    await expect(
      database.booking.findFirstOrThrow({
        where: { seriesId: foreign.id },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual({ status: "ACTIVE", cancelledAt: null });
  });

  it("allows only one of two concurrent whole-series cancellation commands", async () => {
    const series = await insertSeries({
      userId: OLENA_ID,
      occurrences: [futureOccurrence(0), futureOccurrence(1)]
    });

    const responses = await Promise.all([
      cancel(olena, series.id),
      cancel(olena, series.id)
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(responses.find(({ status }) => status === 200)?.body).toEqual({
      series: {
        id: series.id,
        status: "CANCELLED",
        cancelledAt: NOW.toISOString(),
        cancelledCount: 2
      }
    });
    expect(
      responses.find(({ status }) => status === 409)?.body.error.code
    ).toBe("SERIES_NOT_CANCELLABLE");
    await expect(
      database.booking.findMany({
        where: { seriesId: series.id },
        orderBy: { occurrenceIndex: "asc" },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual([
      { status: "CANCELLED", cancelledAt: NOW },
      { status: "CANCELLED", cancelledAt: NOW }
    ]);
  });

  it("rolls back every sibling when PostgreSQL fails the transaction", async () => {
    const series = await insertSeries({
      userId: OLENA_ID,
      occurrences: [
        futureOccurrence(0),
        { ...futureOccurrence(1), title: "Force cancellation failure" }
      ]
    });
    await installDeferredCancellationFailure();

    try {
      await cancel(olena, series.id).expect(500);
    } finally {
      await removeDeferredCancellationFailure();
    }

    await expect(
      database.booking.findMany({
        where: { seriesId: series.id },
        orderBy: { occurrenceIndex: "asc" },
        select: { status: true, cancelledAt: true }
      })
    ).resolves.toEqual([
      { status: "ACTIVE", cancelledAt: null },
      { status: "ACTIVE", cancelledAt: null }
    ]);
  });

  function insertSeries(input: {
    userId: string;
    occurrences: OccurrenceInput[];
  }) {
    return database.bookingSeries.create({
      data: {
        userId: input.userId,
        roomId: ROOM_ID,
        title: "Cancellation series",
        firstLocalDate: new Date("2035-01-15T00:00:00.000Z"),
        firstLocalStartTime: new Date("1970-01-01T10:00:00.000Z"),
        durationMinutes: 30,
        occurrenceCount: input.occurrences.length,
        bookings: {
          create: input.occurrences.map((occurrence) => ({
            room: { connect: { id: ROOM_ID } },
            user: { connect: { id: input.userId } },
            title: occurrence.title,
            occurrenceIndex: occurrence.occurrenceIndex,
            startAt: new Date(occurrence.startAt),
            endAt: new Date(occurrence.endAt),
            ...(occurrence.status === undefined
              ? {}
              : { status: occurrence.status }),
            ...(occurrence.cancelledAt === undefined
              ? {}
              : { cancelledAt: occurrence.cancelledAt })
          }))
        }
      },
      include: { bookings: { orderBy: { occurrenceIndex: "asc" } } }
    });
  }

  async function installDeferredCancellationFailure(): Promise<void> {
    await database.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_series_cancellation() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'CANCELLED' AND NEW.title = 'Force cancellation failure' THEN
          RAISE EXCEPTION 'forced series cancellation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await database.$executeRawUnsafe(`
      CREATE CONSTRAINT TRIGGER test_fail_series_cancellation_trigger
      AFTER UPDATE ON bookings
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION test_fail_series_cancellation()
    `);
  }

  async function removeDeferredCancellationFailure(): Promise<void> {
    await database.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS test_fail_series_cancellation_trigger ON bookings"
    );
    await database.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS test_fail_series_cancellation()"
    );
  }
});

interface OccurrenceInput {
  occurrenceIndex: number;
  title: string;
  startAt: string;
  endAt: string;
  status?: "ACTIVE" | "CANCELLED";
  cancelledAt?: Date;
}

interface AuthenticatedAgent {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
}

function futureOccurrence(occurrenceIndex: number): OccurrenceInput {
  const startAt = new Date(
    Date.parse("2035-01-15T10:00:00.000Z") + occurrenceIndex * 60 * 60 * 1_000
  );
  return {
    occurrenceIndex,
    title: `Future sibling ${occurrenceIndex}`,
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + 30 * 60 * 1_000).toISOString()
  };
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

function cancel(authenticated: AuthenticatedAgent, seriesId: string) {
  return authenticated.agent
    .post(`/api/v1/booking-series/${seriesId}/cancel`)
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

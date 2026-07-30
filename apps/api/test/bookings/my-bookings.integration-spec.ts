import { FixedClock } from "@mrb/time";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const NOW = new Date("2035-01-15T12:00:00.000Z");
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";

describe("GET /api/v1/my-bookings", () => {
  let context: PostgresTestApp;
  let database: DatabaseService;
  let olena: ReturnType<typeof request.agent>;

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

  it("requires authentication and a valid section", async () => {
    await request(context.app.getHttpServer())
      .get("/api/v1/my-bookings?section=upcoming")
      .expect(401);

    const invalid = await olena
      .get("/api/v1/my-bookings?section=unknown")
      .expect(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists only the user's unended active records in chronological order", async () => {
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000001",
      userId: OLENA_ID,
      startAt: "2035-01-15T11:30:00.000Z",
      endAt: "2035-01-15T12:30:00.000Z",
      title: "Активне"
    });
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000002",
      userId: OLENA_ID,
      startAt: "2035-01-15T13:00:00.000Z",
      endAt: "2035-01-15T13:30:00.000Z",
      title: "Майбутнє"
    });
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000003",
      userId: ALEX_ID,
      startAt: "2035-01-15T14:00:00.000Z",
      endAt: "2035-01-15T14:30:00.000Z",
      title: "Чуже"
    });
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000004",
      userId: OLENA_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z",
      title: "Завершене"
    });

    const response = await olena
      .get("/api/v1/my-bookings?section=upcoming")
      .expect(200);

    expect(response.body).toEqual({
      bookings: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          room: { id: ROOM_ID, name: "Арсенал" },
          title: "Активне",
          startAt: "2035-01-15T11:30:00.000Z",
          endAt: "2035-01-15T12:30:00.000Z",
          state: "ACTIVE"
        },
        {
          id: "20000000-0000-4000-8000-000000000002",
          room: { id: ROOM_ID, name: "Арсенал" },
          title: "Майбутнє",
          startAt: "2035-01-15T13:00:00.000Z",
          endAt: "2035-01-15T13:30:00.000Z",
          state: "UPCOMING"
        }
      ],
      nextCursor: null
    });
  });

  it("lists completed and cancelled history newest first", async () => {
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000010",
      userId: OLENA_ID,
      startAt: "2035-01-15T10:00:00.000Z",
      endAt: "2035-01-15T10:30:00.000Z",
      title: "Завершене"
    });
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000011",
      userId: OLENA_ID,
      startAt: "2035-01-16T10:00:00.000Z",
      endAt: "2035-01-16T10:30:00.000Z",
      title: "Скасоване",
      status: "CANCELLED",
      cancelledAt: NOW
    });
    await insertBooking({
      id: "20000000-0000-4000-8000-000000000012",
      userId: OLENA_ID,
      startAt: "2035-01-15T13:00:00.000Z",
      endAt: "2035-01-15T13:30:00.000Z",
      title: "Ще активне"
    });

    const response = await olena
      .get("/api/v1/my-bookings?section=history")
      .expect(200);

    expect(response.body.bookings).toEqual([
      expect.objectContaining({
        id: "20000000-0000-4000-8000-000000000011",
        state: "CANCELLED"
      }),
      expect.objectContaining({
        id: "20000000-0000-4000-8000-000000000010",
        state: "COMPLETED"
      })
    ]);
    expect(response.body.nextCursor).toBeNull();
  });

  it("paginates history by opaque cursor without duplicates", async () => {
    await database.booking.createMany({
      data: Array.from({ length: 22 }, (_, index) => {
        const startAt = new Date(
          Date.parse("2035-01-15T10:00:00.000Z") - index * 60 * 60 * 1_000
        );
        return {
          id: `20000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
          roomId: ROOM_ID,
          userId: OLENA_ID,
          title: `Історія ${index + 1}`,
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60 * 1_000)
        };
      })
    });

    const first = await olena
      .get("/api/v1/my-bookings?section=history")
      .expect(200);
    expect(first.body.bookings).toHaveLength(20);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await olena
      .get(
        `/api/v1/my-bookings?section=history&cursor=${encodeURIComponent(first.body.nextCursor)}`
      )
      .expect(200);
    expect(second.body.bookings).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();

    const ids = [...first.body.bookings, ...second.body.bookings].map(
      (booking: { id: string }) => booking.id
    );
    expect(new Set(ids).size).toBe(22);
  });

  it("rejects malformed cursors and cursors on the upcoming section", async () => {
    const malformed = await olena
      .get("/api/v1/my-bookings?section=history&cursor=invalid")
      .expect(400);
    expect(malformed.body.error.code).toBe("INVALID_CURSOR");

    const upcoming = await olena
      .get("/api/v1/my-bookings?section=upcoming&cursor=invalid")
      .expect(400);
    expect(upcoming.body.error.code).toBe("INVALID_CURSOR");
  });

  function insertBooking(input: {
    id: string;
    userId: string;
    title: string;
    startAt: string;
    endAt: string;
    status?: "ACTIVE" | "CANCELLED";
    cancelledAt?: Date;
  }) {
    return database.booking.create({
      data: {
        id: input.id,
        roomId: ROOM_ID,
        userId: input.userId,
        title: input.title,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.cancelledAt === undefined
          ? {}
          : { cancelledAt: input.cancelledAt })
      }
    });
  }
});

async function login(
  context: PostgresTestApp,
  email: string,
  password: string
) {
  const agent = request.agent(context.app.getHttpServer());
  await agent
    .post("/api/v1/auth/login")
    .set("Origin", APP_ORIGIN)
    .send({ email, password })
    .expect(200);
  return agent;
}

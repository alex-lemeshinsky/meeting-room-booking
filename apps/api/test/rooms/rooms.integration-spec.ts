import { DatabaseService } from "../../src/database/database.service.js";
import { getCurrentLocalWeekStart, getLocalWeek } from "@mrb/time";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import {
  runPrismaCommand,
  startPostgresTestApp
} from "../support/postgres-test-app.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("GET /api/v1/rooms", () => {
  let context: PostgresTestApp;
  const scheduleRoomId = "10000000-0000-4000-8000-000000000002";
  const scheduleBookingIds = [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000004",
    "30000000-0000-4000-8000-000000000005",
    "30000000-0000-4000-8000-000000000006"
  ] as const;

  beforeAll(async () => {
    context = await startPostgresTestApp({ seed: true });
  }, 120_000);

  afterAll(async () => context.stop());

  it("requires a session and returns seeded public rooms in floor/name order", async () => {
    const server = context.app.getHttpServer();
    await request(server).get("/api/v1/rooms").expect(401);
    await request(server).get("/api/v1/rooms?minCapacity=10").expect(401);

    const authenticatedAgent = await loginAsOlena(server);

    const response = await authenticatedAgent.get("/api/v1/rooms").expect(200);

    expect(response.body.rooms).toHaveLength(6);
    expect(response.body.rooms).toEqual(
      [...response.body.rooms].sort(
        (left, right) =>
          left.floor - right.floor || left.name.localeCompare(right.name, "uk")
      )
    );
    expect(response.body.rooms[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      floor: expect.any(Number),
      capacity: expect.any(Number)
    });
  });

  it("filters rooms by minimum capacity while preserving stable order", async () => {
    const authenticatedAgent = await loginAsOlena(context.app.getHttpServer());

    const response = await authenticatedAgent
      .get("/api/v1/rooms?minCapacity=10")
      .expect(200);

    expect(
      response.body.rooms.map((room: { capacity: number }) => room.capacity)
    ).toEqual([10, 12, 16]);
    expect(
      response.body.rooms.map((room: { name: string }) => room.name)
    ).toEqual(["Обрій", "Поділ", "Софія"]);
  });

  it("returns an empty room list when no capacity qualifies", async () => {
    const authenticatedAgent = await loginAsOlena(context.app.getHttpServer());

    await authenticatedAgent
      .get("/api/v1/rooms?minCapacity=17")
      .expect(200)
      .expect({ rooms: [] });
  });

  it.each([
    "minCapacity=",
    "minCapacity=0",
    "minCapacity=-1",
    "minCapacity=1.5",
    "minCapacity=six",
    "minCapacity=1&minCapacity=2"
  ])("rejects invalid capacity query %s", async (query) => {
    const authenticatedAgent = await loginAsOlena(context.app.getHttpServer());

    const response = await authenticatedAgent
      .get(`/api/v1/rooms?${query}`)
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      fields: { minCapacity: expect.any(Array) }
    });
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });

  it("reruns the seed without changing identities, duplicating bookings, or replacing password hashes", async () => {
    const database = context.app.get(DatabaseService);
    const usersBefore = await database.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const roomsBefore = await database.room.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const bookingsBefore = await database.booking.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    await database.booking.update({
      where: { id: "20000000-0000-4000-8000-000000000001" },
      data: {
        roomId: "10000000-0000-4000-8000-000000000006",
        userId: "00000000-0000-4000-8000-000000000002",
        title: "Застарілі дані",
        startAt: new Date("2040-01-15T10:00:00.000Z"),
        endAt: new Date("2040-01-15T11:00:00.000Z"),
        status: "CANCELLED",
        cancelledAt: new Date("2040-01-14T10:00:00.000Z")
      }
    });
    await database.user.update({
      where: { id: "00000000-0000-4000-8000-000000000001" },
      data: { passwordHash: "existing-password-hash" }
    });

    runPrismaCommand(["db", "seed"], "seed");

    const usersAfter = await database.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const roomsAfter = await database.room.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const bookingsAfter = await database.booking.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        roomId: true,
        userId: true,
        title: true,
        startAt: true,
        endAt: true,
        status: true,
        cancelledAt: true,
        room: { select: { name: true } }
      }
    });

    expect(usersAfter).toHaveLength(2);
    expect(roomsAfter).toHaveLength(6);
    expect(usersAfter).toEqual(usersBefore);
    expect(roomsAfter).toEqual(roomsBefore);
    expect(bookingsAfter.map(({ id }) => ({ id }))).toEqual(bookingsBefore);
    expect(bookingsAfter.map(({ id }) => id)).toEqual([
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
      "20000000-0000-4000-8000-000000000004"
    ]);
    expect(new Set(bookingsAfter.map((booking) => booking.userId)).size).toBe(
      2
    );
    expect(
      new Set(bookingsAfter.map((booking) => booking.roomId)).size
    ).toBeGreaterThanOrEqual(2);
    expect(
      bookingsAfter.every(
        (booking) => booking.status === "ACTIVE" && booking.cancelledAt === null
      )
    ).toBe(true);

    const now = new Date();
    const currentWeek = getLocalWeek(
      getCurrentLocalWeekStart("Europe/Kyiv", now),
      "Europe/Kyiv",
      now
    );
    const currentWeekBookings = bookingsAfter.filter(
      (booking) =>
        booking.startAt < new Date(currentWeek.to) &&
        booking.endAt > new Date(currentWeek.from)
    );
    expect(currentWeekBookings).toHaveLength(2);
    expect(currentWeekBookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Планування спринту",
          room: { name: "Дніпро" }
        })
      ])
    );
    expect(bookingsAfter.some((booking) => booking.endAt < now)).toBe(true);
    expect(bookingsAfter.some((booking) => booking.startAt > now)).toBe(true);
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: "00000000-0000-4000-8000-000000000001" },
        select: { passwordHash: true }
      })
    ).resolves.toEqual({ passwordHash: "existing-password-hash" });
  });

  describe("GET /api/v1/rooms/:roomId/schedule", () => {
    let authenticatedAgent: ReturnType<typeof request.agent>;

    beforeAll(async () => {
      const database = context.app.get(DatabaseService);
      await database.booking.deleteMany({
        where: { id: { in: [...scheduleBookingIds] } }
      });
      await database.booking.createMany({
        data: [
          {
            id: scheduleBookingIds[0],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000001",
            title: "Ends at range start",
            startAt: new Date("2034-12-31T23:00:00.000Z"),
            endAt: new Date("2035-01-01T00:00:00.000Z"),
            status: "ACTIVE"
          },
          {
            id: scheduleBookingIds[1],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000001",
            title: "Olena planning",
            startAt: new Date("2035-01-01T00:00:00.000Z"),
            endAt: new Date("2035-01-01T01:00:00.000Z"),
            status: "ACTIVE"
          },
          {
            id: scheduleBookingIds[2],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000002",
            title: "Guest review",
            startAt: new Date("2035-01-01T01:00:00.000Z"),
            endAt: new Date("2035-01-01T02:00:00.000Z"),
            status: "ACTIVE"
          },
          {
            id: scheduleBookingIds[3],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000002",
            title: "Cancelled review",
            startAt: new Date("2035-01-01T02:00:00.000Z"),
            endAt: new Date("2035-01-01T03:00:00.000Z"),
            status: "CANCELLED",
            cancelledAt: new Date("2034-12-31T12:00:00.000Z")
          },
          {
            id: scheduleBookingIds[4],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000001",
            title: "Ends at range end",
            startAt: new Date("2035-01-07T23:00:00.000Z"),
            endAt: new Date("2035-01-08T00:00:00.000Z"),
            status: "ACTIVE"
          },
          {
            id: scheduleBookingIds[5],
            roomId: scheduleRoomId,
            userId: "00000000-0000-4000-8000-000000000002",
            title: "Starts at range end",
            startAt: new Date("2035-01-08T00:00:00.000Z"),
            endAt: new Date("2035-01-08T01:00:00.000Z"),
            status: "ACTIVE"
          }
        ]
      });

      authenticatedAgent = request.agent(context.app.getHttpServer());
      await authenticatedAgent
        .post("/api/v1/auth/login")
        .set("Origin", "http://127.0.0.1:3000")
        .send({ email: "alex@example.com", password: "Meeting123!" })
        .expect(200);
    });

    afterAll(async () => {
      await context.app.get(DatabaseService).booking.deleteMany({
        where: { id: { in: [...scheduleBookingIds] } }
      });
    });

    it("requires an authenticated session", async () => {
      await request(context.app.getHttpServer())
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query({
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-08T00:00:00Z"
        })
        .expect(401);
    });

    it("rejects room identifiers that are not UUID v4 values", async () => {
      const response = await authenticatedAgent
        .get("/api/v1/rooms/10000000-0000-1000-8000-000000000002/schedule")
        .query({
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-08T00:00:00Z"
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: { roomId: expect.any(Array) }
        }
      });
    });

    it.each([
      [
        "numeric offset from",
        { from: "2035-01-01T02:00:00+02:00", to: "2035-03-01T00:00:00Z" },
        "from"
      ],
      [
        "local date-time from",
        { from: "2035-01-01T00:00:00", to: "2035-03-01T00:00:00Z" },
        "from"
      ],
      [
        "nonexistent calendar date from",
        { from: "2035-02-30T00:00:00Z", to: "2035-03-01T00:00:00Z" },
        "from"
      ],
      [
        "numeric offset to",
        { from: "2035-01-01T00:00:00Z", to: "2035-01-08T02:00:00+02:00" },
        "to"
      ],
      ["missing to", { from: "2035-01-01T00:00:00Z" }, "to"]
    ])("rejects a %s schedule instant", async (_label, query, field) => {
      const response = await authenticatedAgent
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query(query)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: { [field]: expect.any(Array) }
        }
      });
    });

    it.each([
      [
        "an eight-day range with sub-millisecond overflow",
        {
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-09T00:00:00.000999Z"
        },
        ["to"]
      ],
      [
        "a positive sub-millisecond range",
        {
          from: "2035-01-01T00:00:00.000000Z",
          to: "2035-01-01T00:00:00.000999Z"
        },
        ["from", "to"]
      ]
    ])("rejects %s at validation", async (_label, query, fields) => {
      const response = await authenticatedAgent
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query(query)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: Object.fromEntries(
            fields.map((field) => [field, expect.any(Array)])
          )
        }
      });
    });

    it.each([
      [
        "one",
        "2035-01-01T00:00:00.1Z",
        "2035-01-01T00:00:00.2Z",
        "2035-01-01T00:00:00.100Z",
        "2035-01-01T00:00:00.200Z"
      ],
      [
        "two",
        "2035-01-01T00:00:00.01Z",
        "2035-01-01T00:00:00.02Z",
        "2035-01-01T00:00:00.010Z",
        "2035-01-01T00:00:00.020Z"
      ],
      [
        "three",
        "2035-01-01T00:00:00.001Z",
        "2035-01-01T00:00:00.002Z",
        "2035-01-01T00:00:00.001Z",
        "2035-01-01T00:00:00.002Z"
      ]
    ])(
      "accepts a positive range with %s fractional digits",
      async (_label, from, to, normalizedFrom, normalizedTo) => {
        const response = await authenticatedAgent
          .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
          .query({ from, to })
          .expect(200);

        expect(response.body).toMatchObject({
          from: normalizedFrom,
          to: normalizedTo
        });
      }
    );

    it("rejects a range whose start is not before its end", async () => {
      const response = await authenticatedAgent
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query({
          from: "2035-01-08T00:00:00Z",
          to: "2035-01-08T00:00:00Z"
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "INVALID_SCHEDULE_RANGE",
          message: "Schedule range is invalid",
          fields: {
            from: ["from must be before to"],
            to: ["to must be after from"]
          }
        }
      });
    });

    it("allows exactly eight days and rejects any wider range", async () => {
      await authenticatedAgent
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query({
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-09T00:00:00Z"
        })
        .expect(200);

      const response = await authenticatedAgent
        .get(`/api/v1/rooms/${scheduleRoomId}/schedule`)
        .query({
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-09T00:00:00.001Z"
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "INVALID_SCHEDULE_RANGE",
          message: "Schedule range is invalid",
          fields: {
            to: ["Schedule range must not exceed 8 days"]
          }
        }
      });
    });

    it("returns ROOM_NOT_FOUND for a valid absent room", async () => {
      const response = await authenticatedAgent
        .get("/api/v1/rooms/ffffffff-ffff-4fff-8fff-ffffffffffff/schedule")
        .query({
          from: "2035-01-01T00:00:00Z",
          to: "2035-01-08T00:00:00Z"
        })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          code: "ROOM_NOT_FOUND",
          message: "Room not found"
        }
      });
    });

    it("uses half-open overlap boundaries and excludes cancelled bookings", async () => {
      const response = await getFixtureSchedule(authenticatedAgent);

      expect(
        response.body.bookings.map((booking: { id: string }) => booking.id)
      ).toEqual([
        scheduleBookingIds[1],
        scheduleBookingIds[2],
        scheduleBookingIds[4]
      ]);
    });

    it("orders returned bookings by start instant", async () => {
      const response = await getFixtureSchedule(authenticatedAgent);

      expect(
        response.body.bookings.map(
          (booking: { startAt: string }) => booking.startAt
        )
      ).toEqual([
        "2035-01-01T00:00:00.000Z",
        "2035-01-01T01:00:00.000Z",
        "2035-01-07T23:00:00.000Z"
      ]);
    });

    it("returns only public organizer fields and computes ownership", async () => {
      const response = await getFixtureSchedule(authenticatedAgent);

      expect(response.body).toEqual({
        room: {
          id: scheduleRoomId,
          name: "Дніпро",
          floor: 1,
          capacity: 6
        },
        from: "2035-01-01T00:00:00.000Z",
        to: "2035-01-08T00:00:00.000Z",
        bookings: [
          {
            id: scheduleBookingIds[1],
            title: "Olena planning",
            startAt: "2035-01-01T00:00:00.000Z",
            endAt: "2035-01-01T01:00:00.000Z",
            organizer: {
              id: "00000000-0000-4000-8000-000000000001",
              name: "Олена"
            },
            isOwn: false
          },
          {
            id: scheduleBookingIds[2],
            title: "Guest review",
            startAt: "2035-01-01T01:00:00.000Z",
            endAt: "2035-01-01T02:00:00.000Z",
            organizer: {
              id: "00000000-0000-4000-8000-000000000002",
              name: "Алекс"
            },
            isOwn: true
          },
          {
            id: scheduleBookingIds[4],
            title: "Ends at range end",
            startAt: "2035-01-07T23:00:00.000Z",
            endAt: "2035-01-08T00:00:00.000Z",
            organizer: {
              id: "00000000-0000-4000-8000-000000000001",
              name: "Олена"
            },
            isOwn: false
          }
        ]
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|tokenHash|csrfTokenHash|cancelledAt|createdAt|updatedAt/
      );
    });
  });

  function getFixtureSchedule(
    agent: ReturnType<typeof request.agent>
  ): ReturnType<ReturnType<typeof request.agent>["get"]> {
    return agent.get(`/api/v1/rooms/${scheduleRoomId}/schedule`).query({
      from: "2035-01-01T00:00:00Z",
      to: "2035-01-08T00:00:00Z"
    });
  }
});

async function loginAsOlena(
  server: Parameters<typeof request.agent>[0]
): Promise<ReturnType<typeof request.agent>> {
  const authenticatedAgent = request.agent(server);
  await authenticatedAgent
    .post("/api/v1/auth/login")
    .set("Origin", "http://127.0.0.1:3000")
    .send({ email: "olena@example.com", password: "Rooms123!" })
    .expect(200);
  return authenticatedAgent;
}

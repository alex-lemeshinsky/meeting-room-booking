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

  beforeAll(async () => {
    context = await startPostgresTestApp({ seed: true });
  }, 120_000);

  afterAll(async () => context.stop());

  it("requires a session and returns seeded public rooms in floor/name order", async () => {
    const server = context.app.getHttpServer();
    await request(server).get("/api/v1/rooms").expect(401);

    const authenticatedAgent = request.agent(server);
    await authenticatedAgent
      .post("/api/v1/auth/login")
      .set("Origin", "http://127.0.0.1:3000")
      .send({ email: "olena@example.com", password: "Rooms123!" })
      .expect(200);

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
});

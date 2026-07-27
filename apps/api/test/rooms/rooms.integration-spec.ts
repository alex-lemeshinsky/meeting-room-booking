import { DatabaseService } from "../../src/database/database.service.js";
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

  it("preserves seeded user and room identities when seeded again", async () => {
    const database = context.app.get(DatabaseService);
    const usersBefore = await database.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
    });
    const roomsBefore = await database.room.findMany({
      orderBy: { id: "asc" },
      select: { id: true }
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

    expect(usersAfter).toHaveLength(2);
    expect(roomsAfter).toHaveLength(6);
    expect(usersAfter).toEqual(usersBefore);
    expect(roomsAfter).toEqual(roomsBefore);
    await expect(
      database.user.findUniqueOrThrow({
        where: { id: "00000000-0000-4000-8000-000000000001" },
        select: { passwordHash: true }
      })
    ).resolves.toEqual({ passwordHash: "existing-password-hash" });
  });
});

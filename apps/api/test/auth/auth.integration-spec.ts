import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("POST /api/v1/auth/register", () => {
  let context: PostgresTestApp;

  beforeAll(async () => {
    context = await startPostgresTestApp();
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
});

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/bootstrap.js";

describe("HTTP boundary", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    app = await createApp();
    await app.init();
  });

  afterAll(async () => app.close());

  it("returns validation errors with a request ID", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", "http://127.0.0.1:3000")
      .send({ name: "Олена", email: "not-an-email", password: "Rooms123!" })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        fields: { email: ["Введіть коректний email"] }
      }
    });
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(response.headers["x-request-id"]).toBe(
      response.body.error.requestId
    );
  });

  it("rejects a foreign origin before registration", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", "https://evil.example")
      .send({
        name: "Олена",
        email: "olena@example.com",
        password: "Rooms123!"
      })
      .expect(403);

    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("rejects non-JSON registration bodies", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", "http://127.0.0.1:3000")
      .set("Content-Type", "text/plain")
      .send("name=Olena")
      .expect(415);

    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

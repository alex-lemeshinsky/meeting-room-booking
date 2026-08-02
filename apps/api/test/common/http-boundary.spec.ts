import { Controller, Get, Module, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp, createApp } from "../../src/bootstrap.js";
import { AppError } from "../../src/common/errors/app-error.js";

@Controller("unexpected")
class UnexpectedErrorController {
  @Get()
  fail(): never {
    throw new Error("private-stack-marker");
  }

  @Get("details")
  details(): never {
    throw new AppError(409, "BOOKING_CONFLICT", "Conflict", undefined, {
      occurrenceNumber: 3,
      startAt: "2035-02-19T07:00:00.000Z",
      endAt: "2035-02-19T07:30:00.000Z"
    });
  }
}

@Module({ controllers: [UnexpectedErrorController] })
class UnexpectedErrorModule {}

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

  it("returns a stable redacted envelope for an unexpected exception", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [UnexpectedErrorModule]
    }).compile();
    const errorApp = configureApp(testingModule.createNestApplication());

    try {
      await errorApp.init();
      const response = await request(errorApp.getHttpServer())
        .get("/api/v1/unexpected")
        .set("X-Request-Id", "request-unexpected")
        .expect(500);

      expect(response.body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          requestId: "request-unexpected"
        }
      });
      expect(JSON.stringify(response.body)).not.toContain(
        "private-stack-marker"
      );
      expect(JSON.stringify(response.body)).not.toContain("stack");
    } finally {
      await errorApp.close();
    }
  });

  it("passes typed optional application error details through the envelope", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [UnexpectedErrorModule]
    }).compile();
    const errorApp = configureApp(testingModule.createNestApplication());

    try {
      await errorApp.init();
      const response = await request(errorApp.getHttpServer())
        .get("/api/v1/unexpected/details")
        .expect(409);

      expect(response.body.error).toMatchObject({
        code: "BOOKING_CONFLICT",
        details: {
          occurrenceNumber: 3,
          startAt: "2035-02-19T07:00:00.000Z",
          endAt: "2035-02-19T07:30:00.000Z"
        }
      });
    } finally {
      await errorApp.close();
    }
  });
});

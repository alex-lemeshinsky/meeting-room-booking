import type { INestApplication } from "@nestjs/common";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenApiApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

const UTC_MILLISECOND_INSTANT_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$";

describe("OpenAPI document", () => {
  let app: INestApplication;
  let createdWithoutDatabaseUrl = false;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      app = await createOpenApiApp();
      await app.init();
      createdWithoutDatabaseUrl = process.env.DATABASE_URL === undefined;
    } finally {
      if (databaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = databaseUrl;
    }
  });

  afterAll(async () => app.close());

  it("publishes safe auth and room contracts for generated clients", async () => {
    const document = createOpenApiDocument(app);
    await writeFile(
      resolve(import.meta.dirname, "../openapi.json"),
      `${JSON.stringify(document, null, 2)}\n`
    );
    const serialized = JSON.stringify(document);

    expect(document.paths["/api/v1/health/live"]).toBeDefined();
    expect(document.paths["/api/v1/health/ready"]).toBeDefined();
    expect(document.paths["/api/v1/auth/register"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/login"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/logout"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/session"]?.get).toBeDefined();
    expect(document.paths["/api/v1/auth/verify-email"]?.post).toBeDefined();
    expect(document.paths["/api/v1/rooms"]?.get).toBeDefined();
    expect(document.components?.schemas?.RegisterDto).toBeDefined();
    expect(document.components?.schemas?.AuthResponseDto).toBeDefined();
    expect(document.components?.schemas?.VerifyEmailDto).toMatchObject({
      required: ["token"],
      properties: {
        token: {
          type: "string",
          minLength: 43,
          maxLength: 43,
          pattern: "^[A-Za-z0-9_-]{43}$"
        }
      }
    });
    expect(document.components?.schemas?.VerifyEmailDto).not.toHaveProperty(
      "properties.token.example"
    );
    expect(document.components?.schemas?.VerifyEmailResponseDto).toMatchObject({
      required: ["verified"],
      properties: {
        verified: { type: "boolean", enum: [true] }
      }
    });
    expect(document.components?.schemas?.RoomDto).toBeDefined();
    expect(document.components?.schemas?.ApiErrorDto).toMatchObject({
      required: ["error"],
      properties: {
        error: { $ref: "#/components/schemas/ApiErrorDetailsDto" }
      }
    });
    expect(document.components?.schemas?.ApiErrorDetailsDto).toMatchObject({
      required: ["code", "message", "requestId"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        fields: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: { type: "string" }
          }
        },
        details: {
          type: "object",
          additionalProperties: true
        },
        requestId: { type: "string" }
      }
    });
    expect(document.paths["/api/v1/auth/register"]?.post?.operationId).toBe(
      "register"
    );
    expect(document.paths["/api/v1/auth/login"]?.post?.operationId).toBe(
      "login"
    );
    expect(document.paths["/api/v1/auth/logout"]?.post?.operationId).toBe(
      "logout"
    );
    expect(
      document.paths["/api/v1/auth/logout"]?.post?.parameters
    ).toContainEqual({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: { type: "string" }
    });
    expect(document.paths["/api/v1/auth/session"]?.get?.operationId).toBe(
      "getSession"
    );
    const verifyEmail = document.paths["/api/v1/auth/verify-email"]?.post;
    expect(verifyEmail?.operationId).toBe("verifyEmail");
    expect(verifyEmail?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/VerifyEmailDto" }
        }
      }
    });
    expect(verifyEmail?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/VerifyEmailResponseDto" }
        }
      }
    });
    expectErrorResponses(
      verifyEmail?.responses,
      [400, 403, 409, 410, 415, 500]
    );
    expect(document.paths["/api/v1/rooms"]?.get?.operationId).toBe("listRooms");
    expectErrorResponses(
      document.paths["/api/v1/auth/register"]?.post?.responses,
      [400, 403, 409, 415, 500]
    );
    expectErrorResponses(
      document.paths["/api/v1/auth/login"]?.post?.responses,
      [400, 401, 403, 415, 500]
    );
    expectErrorResponses(
      document.paths["/api/v1/auth/session"]?.get?.responses,
      [401, 500]
    );
    expectErrorResponses(
      document.paths["/api/v1/auth/logout"]?.post?.responses,
      [401, 403, 415, 500]
    );
    const listRooms = document.paths["/api/v1/rooms"]?.get;
    expectErrorResponses(listRooms?.responses, [400, 401, 500]);
    expect(listRooms?.parameters).toContainEqual(
      expect.objectContaining({
        in: "query",
        name: "minCapacity",
        required: false,
        schema: expect.objectContaining({
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER
        })
      })
    );
    expect(document.components?.securitySchemes?.cookie).toMatchObject({
      in: "cookie",
      name: "mrb_session",
      type: "apiKey"
    });
    expect(serialized).not.toMatch(
      /passwordHash|tokenHash|csrfTokenHash|sessionSecret|csrfSecret/
    );
  });

  it("creates the documentation app without database configuration", async () => {
    expect(createdWithoutDatabaseUrl).toBe(true);
    expect(
      createOpenApiDocument(app).paths["/api/v1/rooms"]?.get
    ).toBeDefined();
  });

  it("publishes the authenticated room schedule operation with safe schemas", () => {
    const document = createOpenApiDocument(app);
    const operation = document.paths["/api/v1/rooms/{roomId}/schedule"]?.get;

    expect(operation?.operationId).toBe("getRoomSchedule");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "roomId",
          required: true,
          schema: expect.objectContaining({ type: "string", format: "uuid" })
        }),
        expect.objectContaining({
          in: "query",
          name: "from",
          required: true,
          schema: expect.objectContaining({
            type: "string",
            format: "date-time",
            pattern: UTC_MILLISECOND_INSTANT_PATTERN
          })
        }),
        expect.objectContaining({
          in: "query",
          name: "to",
          required: true,
          schema: expect.objectContaining({
            type: "string",
            format: "date-time",
            pattern: UTC_MILLISECOND_INSTANT_PATTERN
          })
        })
      ])
    );
    expect(operation?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ScheduleResponseDto" }
        }
      }
    });
    expectErrorResponses(operation?.responses, [400, 401, 404, 500]);
    expect(document.components?.schemas?.ScheduleOrganizerDto).toMatchObject({
      required: ["id", "name"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" }
      }
    });
    expect(document.components?.schemas?.ScheduleQueryDto).toMatchObject({
      required: ["from", "to"],
      properties: {
        from: { pattern: UTC_MILLISECOND_INSTANT_PATTERN },
        to: { pattern: UTC_MILLISECOND_INSTANT_PATTERN }
      }
    });
    expect(document.components?.schemas?.ScheduleBookingDto).toMatchObject({
      required: [
        "id",
        "title",
        "startAt",
        "endAt",
        "organizer",
        "isOwn",
        "seriesId",
        "occurrenceIndex",
        "occurrenceCount"
      ],
      properties: {
        id: { type: "string", format: "uuid" },
        startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" },
        organizer: {
          $ref: "#/components/schemas/ScheduleOrganizerDto"
        },
        isOwn: { type: "boolean" },
        seriesId: { type: "string", format: "uuid", nullable: true },
        occurrenceIndex: { type: "integer", nullable: true },
        occurrenceCount: { type: "integer", nullable: true }
      }
    });
    expect(document.components?.schemas?.ScheduleResponseDto).toMatchObject({
      required: ["room", "from", "to", "bookings"],
      properties: {
        room: { $ref: "#/components/schemas/RoomDto" },
        from: { type: "string", format: "date-time" },
        to: { type: "string", format: "date-time" },
        bookings: {
          type: "array",
          items: { $ref: "#/components/schemas/ScheduleBookingDto" }
        }
      }
    });
    expect(JSON.stringify(operation)).not.toMatch(
      /passwordHash|tokenHash|csrfTokenHash|sessionSecret|csrfSecret/
    );
  });

  it("publishes the authenticated CSRF-protected booking creation contract", () => {
    const document = createOpenApiDocument(app);
    const operation = document.paths["/api/v1/bookings"]?.post;

    expect(operation?.operationId).toBe("createBooking");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toContainEqual({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: { type: "string" }
    });
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateBookingDto" }
        }
      }
    });
    expect(operation?.responses?.[201]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateBookingResponseDto" }
        }
      }
    });
    expectErrorResponses(
      operation?.responses,
      [400, 401, 403, 404, 409, 415, 500]
    );
    expect(document.components?.schemas?.CreateBookingDto).toMatchObject({
      required: ["roomId", "title", "startAt", "endAt"],
      properties: {
        roomId: { type: "string", format: "uuid" },
        title: { type: "string" },
        startAt: {
          type: "string",
          format: "date-time",
          pattern: UTC_MILLISECOND_INSTANT_PATTERN
        },
        endAt: {
          type: "string",
          format: "date-time",
          pattern: UTC_MILLISECOND_INSTANT_PATTERN
        }
      }
    });
    expect(document.components?.schemas?.CreatedBookingDto).toMatchObject({
      required: ["id", "roomId", "title", "startAt", "endAt"]
    });
    expect(JSON.stringify(operation)).not.toMatch(
      /passwordHash|tokenHash|csrfTokenHash|sessionSecret|csrfSecret/
    );
  });

  it("publishes atomic recurring-series creation and typed conflict details", () => {
    const document = createOpenApiDocument(app);
    const operation = document.paths["/api/v1/booking-series"]?.post;

    expect(operation?.operationId).toBe("createBookingSeries");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toContainEqual({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: { type: "string" }
    });
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateBookingSeriesDto" }
        }
      }
    });
    expect(operation?.responses?.[201]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/CreateBookingSeriesResponseDto"
          }
        }
      }
    });
    expectErrorResponses(operation?.responses, [400, 401, 403, 404, 415, 500]);
    expect(operation?.responses?.[409]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/BookingSeriesConflictErrorDto" }
        }
      }
    });
    expect(document.components?.schemas?.CreateBookingSeriesDto).toMatchObject({
      required: ["roomId", "title", "startAt", "endAt", "occurrenceCount"],
      properties: {
        roomId: { type: "string", format: "uuid" },
        title: { type: "string", minLength: 1, maxLength: 100 },
        startAt: {
          type: "string",
          format: "date-time",
          pattern: UTC_MILLISECOND_INSTANT_PATTERN
        },
        endAt: {
          type: "string",
          format: "date-time",
          pattern: UTC_MILLISECOND_INSTANT_PATTERN
        },
        occurrenceCount: {
          type: "integer",
          minimum: 2,
          maximum: 52
        }
      }
    });
    expect(document.components?.schemas?.CreatedBookingSeriesDto).toMatchObject(
      {
        required: [
          "id",
          "roomId",
          "title",
          "officeTimezone",
          "occurrenceCount",
          "rule"
        ]
      }
    );
    expect(
      document.components?.schemas?.CreatedSeriesOccurrenceDto
    ).toMatchObject({
      required: ["id", "occurrenceIndex", "startAt", "endAt"],
      properties: {
        occurrenceIndex: { type: "integer", minimum: 0 },
        startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" }
      }
    });
    expect(
      document.components?.schemas?.CreateBookingSeriesResponseDto
    ).toMatchObject({
      required: ["series", "occurrences"],
      properties: {
        series: { $ref: "#/components/schemas/CreatedBookingSeriesDto" },
        occurrences: {
          type: "array",
          items: { $ref: "#/components/schemas/CreatedSeriesOccurrenceDto" }
        }
      }
    });
    expect(
      document.components?.schemas?.RecurrenceConflictDetailsDto
    ).toMatchObject({
      required: ["occurrenceNumber", "startAt", "endAt"],
      properties: {
        occurrenceNumber: { type: "integer", minimum: 1 },
        startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" }
      }
    });
    expect(
      document.components?.schemas?.BookingSeriesConflictErrorDetailsDto
    ).toMatchObject({
      required: ["code", "message", "details", "requestId"],
      properties: {
        details: {
          $ref: "#/components/schemas/RecurrenceConflictDetailsDto"
        },
        requestId: { type: "string" }
      }
    });
    expect(
      document.components?.schemas?.BookingSeriesConflictErrorDetailsDto
    ).not.toHaveProperty("properties.requestId.format");
  });

  it("publishes the authenticated CSRF-protected booking cancellation command", () => {
    const document = createOpenApiDocument(app);
    const operation =
      document.paths["/api/v1/bookings/{bookingId}/cancel"]?.post;

    expect(operation?.operationId).toBe("cancelBooking");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "bookingId",
          required: true,
          schema: expect.objectContaining({ type: "string", format: "uuid" })
        }),
        {
          in: "header",
          name: "X-CSRF-Token",
          required: true,
          schema: { type: "string" }
        }
      ])
    );
    expect(operation?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CancelBookingResponseDto" }
        }
      }
    });
    expectErrorResponses(
      operation?.responses,
      [400, 401, 403, 404, 409, 415, 500]
    );
    expect(document.components?.schemas?.CancelledBookingDto).toMatchObject({
      required: ["id", "status", "cancelledAt"],
      properties: {
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["CANCELLED"] },
        cancelledAt: { type: "string", format: "date-time" }
      }
    });
  });

  it("publishes the atomic whole-series cancellation command", () => {
    const document = createOpenApiDocument(app);
    const operation =
      document.paths["/api/v1/booking-series/{seriesId}/cancel"]?.post;

    expect(operation?.operationId).toBe("cancelBookingSeries");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "path",
          name: "seriesId",
          required: true,
          schema: expect.objectContaining({ type: "string", format: "uuid" })
        }),
        {
          in: "header",
          name: "X-CSRF-Token",
          required: true,
          schema: { type: "string" }
        }
      ])
    );
    expect(operation?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/CancelBookingSeriesResponseDto"
          }
        }
      }
    });
    expectErrorResponses(
      operation?.responses,
      [400, 401, 403, 404, 409, 415, 500]
    );
    expect(
      document.components?.schemas?.CancelledBookingSeriesDto
    ).toMatchObject({
      required: ["id", "status", "cancelledAt", "cancelledCount"],
      properties: {
        id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["CANCELLED"] },
        cancelledAt: { type: "string", format: "date-time" },
        cancelledCount: { type: "integer", minimum: 1 }
      }
    });
  });

  it("publishes the authenticated My Bookings query and public row states", () => {
    const document = createOpenApiDocument(app);
    const operation = document.paths["/api/v1/my-bookings"]?.get;

    expect(operation?.operationId).toBe("listMyBookings");
    expect(operation?.security).toContainEqual({ cookie: [] });
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: "query",
          name: "section",
          required: true,
          schema: expect.objectContaining({
            type: "string",
            enum: ["upcoming", "history"]
          })
        }),
        expect.objectContaining({
          in: "query",
          name: "cursor",
          required: false,
          schema: expect.objectContaining({ type: "string" })
        })
      ])
    );
    expect(operation?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/MyBookingsResponseDto" }
        }
      }
    });
    expectErrorResponses(operation?.responses, [400, 401, 500]);
    expect(document.components?.schemas?.MyBookingDto).toMatchObject({
      required: [
        "id",
        "room",
        "title",
        "startAt",
        "endAt",
        "state",
        "seriesId",
        "occurrenceIndex",
        "occurrenceCount"
      ],
      properties: {
        id: { type: "string", format: "uuid" },
        room: { $ref: "#/components/schemas/MyBookingRoomDto" },
        startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" },
        state: {
          type: "string",
          enum: ["ACTIVE", "UPCOMING", "COMPLETED", "CANCELLED"]
        },
        seriesId: { type: "string", format: "uuid", nullable: true },
        occurrenceIndex: { type: "integer", nullable: true },
        occurrenceCount: { type: "integer", nullable: true }
      }
    });
    expect(document.components?.schemas?.MyBookingsResponseDto).toMatchObject({
      required: ["bookings", "nextCursor"],
      properties: {
        bookings: {
          type: "array",
          items: { $ref: "#/components/schemas/MyBookingDto" }
        },
        nextCursor: {
          type: "string",
          nullable: true
        }
      }
    });
  });

  it("publishes the notification REST endpoints and contracts", () => {
    const document = createOpenApiDocument(app);
    const listOp = document.paths["/api/v1/notifications"]?.get;
    const markReadOp = document.paths["/api/v1/notifications/{id}/read"]?.patch;

    expect(listOp?.operationId).toBe("listNotifications");
    expect(listOp?.security).toContainEqual({ cookie: [] });
    expect(listOp?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/NotificationsResponseDto" }
        }
      }
    });
    expectErrorResponses(listOp?.responses, [401, 500]);

    expect(markReadOp?.operationId).toBe("markNotificationRead");
    expect(markReadOp?.security).toContainEqual({ cookie: [] });
    expect(markReadOp?.parameters).toContainEqual({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: { type: "string" }
    });
    expect(markReadOp?.responses?.[200]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/MarkReadResponseDto" }
        }
      }
    });
    expectErrorResponses(markReadOp?.responses, [400, 401, 403, 404, 415, 500]);

    expect(document.components?.schemas?.NotificationItemDto).toBeDefined();
    expect(
      document.components?.schemas?.NotificationsResponseDto
    ).toBeDefined();
    expect(document.components?.schemas?.MarkReadResponseDto).toBeDefined();
  });
});

function expectErrorResponses(
  responses: Record<string, unknown> | undefined,
  statuses: number[]
): void {
  for (const status of statuses) {
    expect(responses?.[status]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorDto" }
        }
      }
    });
  }
}

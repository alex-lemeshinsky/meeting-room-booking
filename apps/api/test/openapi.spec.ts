import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenApiApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

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

  it("publishes safe auth and room contracts for generated clients", () => {
    const document = createOpenApiDocument(app);
    const serialized = JSON.stringify(document);

    expect(document.paths["/api/v1/health/live"]).toBeDefined();
    expect(document.paths["/api/v1/health/ready"]).toBeDefined();
    expect(document.paths["/api/v1/auth/register"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/login"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/logout"]?.post).toBeDefined();
    expect(document.paths["/api/v1/auth/session"]?.get).toBeDefined();
    expect(document.paths["/api/v1/rooms"]?.get).toBeDefined();
    expect(document.components?.schemas?.RegisterDto).toBeDefined();
    expect(document.components?.schemas?.AuthResponseDto).toBeDefined();
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
    expectErrorResponses(
      document.paths["/api/v1/rooms"]?.get?.responses,
      [401, 500]
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

import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

describe("OpenAPI document", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
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
    expect(document.components?.securitySchemes?.cookie).toMatchObject({
      in: "cookie",
      name: "mrb_session",
      type: "apiKey"
    });
    expect(serialized).not.toMatch(
      /passwordHash|tokenHash|csrfTokenHash|sessionSecret|csrfSecret/
    );
  });
});

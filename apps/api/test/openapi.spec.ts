import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createOpenApiApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

describe("OpenAPI document", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => app.close());

  it("publishes versioned health contracts", () => {
    const document = createOpenApiDocument(app);

    expect(document.paths["/api/v1/health/live"]).toBeDefined();
    expect(document.paths["/api/v1/health/ready"]).toBeDefined();
  });

  it("creates the documentation app without database configuration", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const documentationApp = await createOpenApiApp();

      try {
        await documentationApp.init();
        const document = createOpenApiDocument(documentationApp);

        expect(document.paths["/api/v1/health/live"]).toBeDefined();
      } finally {
        await documentationApp.close();
      }
    } finally {
      if (databaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = databaseUrl;
    }
  });
});

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

  it("publishes versioned health contracts", () => {
    const document = createOpenApiDocument(app);

    expect(document.paths["/api/v1/health/live"]).toBeDefined();
    expect(document.paths["/api/v1/health/ready"]).toBeDefined();
  });
});

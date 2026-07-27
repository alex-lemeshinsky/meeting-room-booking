import type { INestApplication } from "@nestjs/common";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/bootstrap.js";

describe("GET /api/v1/health/ready", () => {
  let app: INestApplication | undefined;
  let postgres: StartedPostgreSqlContainer | undefined;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:18.4-alpine").start();
    process.env.DATABASE_URL = postgres.getConnectionUri();

    const migration = spawnSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      {
        cwd: resolve(import.meta.dirname, "../../.."),
        env: process.env,
        encoding: "utf8"
      }
    );
    expect(migration.status, migration.stderr).toBe(0);

    app = await createApp();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  it("proves the full Nest app can query migrated PostgreSQL", async () => {
    if (!app) {
      throw new Error("Nest application was not initialized");
    }

    await request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(200)
      .expect({ status: "ok", database: "up" });
  });
});

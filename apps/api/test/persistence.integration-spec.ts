import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import type { PostgresTestApp } from "./support/postgres-test-app.js";
import { startPostgresTestApp } from "./support/postgres-test-app.js";

describe("auth and rooms persistence", () => {
  let context: PostgresTestApp;

  beforeAll(async () => {
    context = await startPostgresTestApp();
  }, 120_000);

  afterAll(async () => {
    await context.stop();
  });

  it("creates users, sessions, and rooms with final constraints", async () => {
    const database = context.app.get(DatabaseService);
    const rows = await database.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'sessions', 'rooms')
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.name)).toEqual(["rooms", "sessions", "users"]);
  });
});

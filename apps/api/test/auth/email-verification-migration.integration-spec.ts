import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const migrationsPath = resolve(
  import.meta.dirname,
  "../../../../prisma/migrations"
);

describe("email verification migration", () => {
  it("backfills legacy users and creates the verification token table", async () => {
    const postgres = await new PostgreSqlContainer(
      "postgres:18.4-alpine"
    ).start();
    const client = new Client({
      connectionString: postgres.getConnectionUri()
    });

    try {
      await client.connect();

      for (const migration of [
        "20260727000000_foundation",
        "20260727190000_auth_rooms_sessions",
        "20260729150000_booking_calendar_read"
      ]) {
        await client.query(
          await readFile(
            resolve(migrationsPath, migration, "migration.sql"),
            "utf8"
          )
        );
      }

      await client.query(`
        INSERT INTO users (
          id, name, email_normalized, password_hash, updated_at
        ) VALUES (
          '00000000-0000-4000-8000-000000000099',
          'Legacy User',
          'legacy@example.com',
          'legacy-hash',
          '2026-07-31T12:00:00.000Z'
        )
      `);

      await client.query(
        await readFile(
          resolve(
            migrationsPath,
            "20260801000000_email_verification",
            "migration.sql"
          ),
          "utf8"
        )
      );

      const result = await client.query(
        "SELECT email_verified_at FROM users WHERE id = '00000000-0000-4000-8000-000000000099'"
      );
      const table = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'email_verification_tokens'
      `);
      const indexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'email_verification_tokens'
      `);

      expect(result.rows[0]?.email_verified_at).toBeInstanceOf(Date);
      expect(table.rows).toEqual([{ table_name: "email_verification_tokens" }]);
      expect(indexes.rows.map(({ indexname }) => indexname).sort()).toEqual([
        "email_verification_tokens_expires_at_idx",
        "email_verification_tokens_pkey",
        "email_verification_tokens_token_hash_key",
        "email_verification_tokens_user_id_idx"
      ]);
    } finally {
      await client.end();
      await postgres.stop();
    }
  }, 120_000);
});

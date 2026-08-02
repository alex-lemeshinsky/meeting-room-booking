import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const migrationsPath = resolve(
  import.meta.dirname,
  "../../../../prisma/migrations"
);
const USER_ID = "00000000-0000-4000-8000-000000000081";
const ROOM_ID = "10000000-0000-4000-8000-000000000081";
const SERIES_ID = "20000000-0000-4000-8000-000000000081";

describe("booking series migration", () => {
  it("preserves one-off bookings and enforces occurrence identity", async () => {
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
        "20260729150000_booking_calendar_read",
        "20260801000000_email_verification"
      ]) {
        await client.query(
          await readFile(
            resolve(migrationsPath, migration, "migration.sql"),
            "utf8"
          )
        );
      }

      await client.query(`
        INSERT INTO "users" (
          "id", "name", "email_normalized", "password_hash", "updated_at"
        ) VALUES (
          '${USER_ID}', 'Legacy User', 'legacy-series@example.com', 'legacy-hash', CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        INSERT INTO "rooms" (
          "id", "name", "floor", "capacity", "updated_at"
        ) VALUES (
          '${ROOM_ID}', 'Legacy room', 1, 4, CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        INSERT INTO "bookings" (
          "id", "room_id", "user_id", "title", "start_at", "end_at", "status", "cancelled_at", "updated_at"
        ) VALUES
          (
            '30000000-0000-4000-8000-000000000081', '${ROOM_ID}', '${USER_ID}', 'Active legacy booking',
            '2031-08-04T09:00:00.000Z', '2031-08-04T10:00:00.000Z', 'ACTIVE', NULL, CURRENT_TIMESTAMP
          ),
          (
            '30000000-0000-4000-8000-000000000082', '${ROOM_ID}', '${USER_ID}', 'Cancelled legacy booking',
            '2031-08-04T10:00:00.000Z', '2031-08-04T11:00:00.000Z', 'CANCELLED', '2031-08-03T10:00:00.000Z', CURRENT_TIMESTAMP
          )
      `);

      await client.query(
        await readFile(
          resolve(
            migrationsPath,
            "20260802000000_booking_series",
            "migration.sql"
          ),
          "utf8"
        )
      );

      const legacyBookings = await client.query(`
        SELECT "series_id", "occurrence_index"
        FROM "bookings"
        WHERE "id" IN (
          '30000000-0000-4000-8000-000000000081',
          '30000000-0000-4000-8000-000000000082'
        )
        ORDER BY "id"
      `);
      expect(legacyBookings.rows).toEqual([
        { series_id: null, occurrence_index: null },
        { series_id: null, occurrence_index: null }
      ]);

      await client.query(`
        INSERT INTO "booking_series" (
          "id", "user_id", "room_id", "title", "first_local_date",
          "first_local_start_time", "duration_minutes", "occurrence_count", "created_at"
        ) VALUES (
          '${SERIES_ID}', '${USER_ID}', '${ROOM_ID}', 'Weekly series', '2031-08-11',
          '09:00:00', 60, 2, CURRENT_TIMESTAMP
        )
      `);
      await insertOccurrence(client, "30000000-0000-4000-8000-000000000083", 0);
      await insertOccurrence(client, "30000000-0000-4000-8000-000000000084", 1);

      await expect(
        insertOccurrence(
          client,
          "30000000-0000-4000-8000-000000000085",
          1,
          "2031-09-01"
        )
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "bookings_series_id_occurrence_index_key"
      });
      await expect(
        client.query(`
          INSERT INTO "bookings" (
            "id", "room_id", "user_id", "title", "start_at", "end_at", "status", "cancelled_at", "series_id", "updated_at"
          ) VALUES (
            '30000000-0000-4000-8000-000000000086', '${ROOM_ID}', '${USER_ID}', 'Invalid metadata',
            '2031-08-25T09:00:00.000Z', '2031-08-25T10:00:00.000Z', 'ACTIVE', NULL, '${SERIES_ID}', CURRENT_TIMESTAMP
          )
        `)
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "bookings_series_occurrence_pair_check"
      });
    } finally {
      await client.end();
      await postgres.stop();
    }
  }, 120_000);
});

async function insertOccurrence(
  client: Client,
  id: string,
  occurrenceIndex: number,
  date = `2031-08-${String(11 + occurrenceIndex * 7).padStart(2, "0")}`
): Promise<void> {
  await client.query(`
    INSERT INTO "bookings" (
      "id", "room_id", "user_id", "title", "start_at", "end_at", "status", "cancelled_at",
      "series_id", "occurrence_index", "updated_at"
    ) VALUES (
      '${id}', '${ROOM_ID}', '${USER_ID}', 'Series occurrence',
      '${date}T09:00:00.000Z',
      '${date}T10:00:00.000Z',
      'ACTIVE', NULL, '${SERIES_ID}', ${occurrenceIndex}, CURRENT_TIMESTAMP
    )
  `);
}

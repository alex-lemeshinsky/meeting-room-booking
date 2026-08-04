import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const migrationsPath = resolve(
  import.meta.dirname,
  "../../../../prisma/migrations"
);

const USER_ID = "00000000-0000-4000-8000-000000000091";
const USER_2_ID = "00000000-0000-4000-8000-000000000092";
const ROOM_ID = "10000000-0000-4000-8000-000000000091";
const BOOKING_1_ID = "30000000-0000-4000-8000-000000000091";
const BOOKING_2_ID = "30000000-0000-4000-8000-000000000092";
const BOOKING_3_ID = "30000000-0000-4000-8000-000000000093";

describe("notification migration", () => {
  it("applies cleanly, accepts valid rows, enforces unique booking pair constraint, and cascades deletes", async () => {
    const postgres = await new PostgreSqlContainer(
      "postgres:18.4-alpine"
    ).start();
    const client = new Client({
      connectionString: postgres.getConnectionUri()
    });

    try {
      await client.connect();

      // Apply Stage 8 migrations
      for (const migration of [
        "20260727000000_foundation",
        "20260727190000_auth_rooms_sessions",
        "20260729150000_booking_calendar_read",
        "20260801000000_email_verification",
        "20260802000000_booking_series"
      ]) {
        await client.query(
          await readFile(
            resolve(migrationsPath, migration, "migration.sql"),
            "utf8"
          )
        );
      }

      // Seed prerequisite users, room, bookings before notifications migration
      await client.query(`
        INSERT INTO "users" (
          "id", "name", "email_normalized", "password_hash", "updated_at"
        ) VALUES
          ('${USER_ID}', 'Notification User', 'user@example.com', 'hash', CURRENT_TIMESTAMP),
          ('${USER_2_ID}', 'User Two', 'user2@example.com', 'hash', CURRENT_TIMESTAMP)
      `);

      await client.query(`
        INSERT INTO "rooms" (
          "id", "name", "floor", "capacity", "updated_at"
        ) VALUES (
          '${ROOM_ID}', 'Boardroom', 2, 10, CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        INSERT INTO "bookings" (
          "id", "room_id", "user_id", "title", "start_at", "end_at", "status", "updated_at"
        ) VALUES
          (
            '${BOOKING_1_ID}', '${ROOM_ID}', '${USER_ID}', 'Current Meeting',
            '2031-08-04T09:00:00.000Z', '2031-08-04T10:00:00.000Z', 'ACTIVE', CURRENT_TIMESTAMP
          ),
          (
            '${BOOKING_2_ID}', '${ROOM_ID}', '${USER_ID}', 'Next Meeting',
            '2031-08-04T10:00:00.000Z', '2031-08-04T11:00:00.000Z', 'ACTIVE', CURRENT_TIMESTAMP
          ),
          (
            '${BOOKING_3_ID}', '${ROOM_ID}', '${USER_ID}', 'User 2 Meeting',
            '2031-08-04T11:00:00.000Z', '2031-08-04T12:00:00.000Z', 'ACTIVE', CURRENT_TIMESTAMP
          )
      `);

      // 1. Apply Stage 9 notification migration cleanly over Stage 8 schema and data
      await client.query(
        await readFile(
          resolve(
            migrationsPath,
            "20260803000000_notifications",
            "migration.sql"
          ),
          "utf8"
        )
      );

      // 2. Insert valid notification row
      const NOTIF_1_ID = "40000000-0000-4000-8000-000000000091";
      await client.query(`
        INSERT INTO "notifications" (
          "id", "user_id", "current_booking_id", "next_booking_id", "type",
          "message", "room_name", "scheduled_for", "created_at"
        ) VALUES (
          '${NOTIF_1_ID}', '${USER_ID}', '${BOOKING_1_ID}', '${BOOKING_2_ID}', 'NEXT_BOOKING_STARTS',
          'Your next booking starts in 10 minutes', 'Boardroom', '2031-08-04T09:50:00.000Z', CURRENT_TIMESTAMP
        )
      `);

      const inserted = await client.query(
        `SELECT * FROM "notifications" WHERE "id" = '${NOTIF_1_ID}'`
      );
      expect(inserted.rows.length).toBe(1);
      expect(inserted.rows[0].type).toBe("NEXT_BOOKING_STARTS");
      expect(inserted.rows[0].room_name).toBe("Boardroom");

      // 3. Duplicate (type, current_booking_id, next_booking_id) fails unique constraint
      const NOTIF_DUP_ID = "40000000-0000-4000-8000-000000000092";
      await expect(
        client.query(`
          INSERT INTO "notifications" (
            "id", "user_id", "current_booking_id", "next_booking_id", "type",
            "message", "room_name", "scheduled_for", "created_at"
          ) VALUES (
            '${NOTIF_DUP_ID}', '${USER_ID}', '${BOOKING_1_ID}', '${BOOKING_2_ID}', 'NEXT_BOOKING_STARTS',
            'Duplicate notification', 'Boardroom', '2031-08-04T09:50:00.000Z', CURRENT_TIMESTAMP
          )
        `)
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "notifications_type_booking_pair_key"
      });

      // 4. Test Cascading Deletion
      // a) Cascading delete when User is deleted
      const NOTIF_USER2_ID = "40000000-0000-4000-8000-000000000093";
      await client.query(`
        INSERT INTO "notifications" (
          "id", "user_id", "current_booking_id", "next_booking_id", "type",
          "message", "room_name", "scheduled_for", "created_at"
        ) VALUES (
          '${NOTIF_USER2_ID}', '${USER_2_ID}', '${BOOKING_2_ID}', '${BOOKING_3_ID}', 'NEXT_BOOKING_STARTS',
          'User 2 notification', 'Boardroom', '2031-08-04T10:50:00.000Z', CURRENT_TIMESTAMP
        )
      `);
      await client.query(`DELETE FROM "users" WHERE "id" = '${USER_2_ID}'`);
      const afterUserDelete = await client.query(
        `SELECT * FROM "notifications" WHERE "id" = '${NOTIF_USER2_ID}'`
      );
      expect(afterUserDelete.rows.length).toBe(0);

      // b) Cascading delete when current_booking is deleted
      const NOTIF_BOOKING_DEL_ID = "40000000-0000-4000-8000-000000000094";
      await client.query(`
        INSERT INTO "notifications" (
          "id", "user_id", "current_booking_id", "next_booking_id", "type",
          "message", "room_name", "scheduled_for", "created_at"
        ) VALUES (
          '${NOTIF_BOOKING_DEL_ID}', '${USER_ID}', '${BOOKING_1_ID}', '${BOOKING_2_ID}', 'OTHER_TYPE',
          'ToDelete notification', 'Boardroom', '2031-08-04T09:50:00.000Z', CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `DELETE FROM "bookings" WHERE "id" = '${BOOKING_1_ID}'`
      );
      const afterBookingDelete = await client.query(
        `SELECT * FROM "notifications" WHERE "id" = '${NOTIF_BOOKING_DEL_ID}'`
      );
      expect(afterBookingDelete.rows.length).toBe(0);
      // Original NOTIF_1_ID should also be deleted because current_booking_id was BOOKING_1_ID
      const originalNotif = await client.query(
        `SELECT * FROM "notifications" WHERE "id" = '${NOTIF_1_ID}'`
      );
      expect(originalNotif.rows.length).toBe(0);
    } finally {
      await client.end();
      await postgres.stop();
    }
  }, 120_000);
});

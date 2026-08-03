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
        AND table_name IN (
          'users',
          'sessions',
          'rooms',
          'email_verification_tokens',
          'bookings',
          'booking_series',
          'notifications'
        )
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.name)).toEqual([
      "booking_series",
      "bookings",
      "email_verification_tokens",
      "notifications",
      "rooms",
      "sessions",
      "users"
    ]);

    const constraints = await database.$queryRaw<Array<{ name: string }>>`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conname IN (
        'booking_series_duration_minutes_check',
        'booking_series_occurrence_count_check',
        'booking_series_office_timezone_check',
        'bookings_series_occurrence_pair_check',
        'bookings_series_occurrence_index_check',
        'bookings_series_id_occurrence_index_key',
        'notifications_type_booking_pair_key'
      )
      ORDER BY conname
    `;

    const constraintNames = constraints.map((constraint) => constraint.name);
    expect(constraintNames).toEqual(
      expect.arrayContaining([
        "booking_series_duration_minutes_check",
        "booking_series_occurrence_count_check",
        "booking_series_office_timezone_check",
        "bookings_series_occurrence_pair_check",
        "bookings_series_occurrence_index_check",
        "bookings_series_id_occurrence_index_key",
        "notifications_type_booking_pair_key"
      ])
    );
  });
});

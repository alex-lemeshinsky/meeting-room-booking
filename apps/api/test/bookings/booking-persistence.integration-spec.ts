import type { Pool } from "pg";
import pg from "pg";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";

describe("booking persistence constraints", () => {
  let context: PostgresTestApp;
  let pool: Pool;

  beforeAll(async () => {
    context = await startPostgresTestApp({ seed: true });
    pool = new pg.Pool({ connectionString: context.databaseUrl });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await context?.stop();
  });

  it("accepts active intervals on both half-open boundaries", async () => {
    await insertBooking(
      pool,
      "30000000-0000-4000-8000-000000000001",
      "2031-01-15T10:00:00.000Z",
      "2031-01-15T11:00:00.000Z"
    );

    await expect(
      insertBooking(
        pool,
        "30000000-0000-4000-8000-000000000002",
        "2031-01-15T09:00:00.000Z",
        "2031-01-15T10:00:00.000Z"
      )
    ).resolves.toBeUndefined();
    await expect(
      insertBooking(
        pool,
        "30000000-0000-4000-8000-000000000003",
        "2031-01-15T11:00:00.000Z",
        "2031-01-15T12:00:00.000Z"
      )
    ).resolves.toBeUndefined();

    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "bookings"
       WHERE "id" = ANY($1::uuid[])`,
      [
        [
          "30000000-0000-4000-8000-000000000001",
          "30000000-0000-4000-8000-000000000002",
          "30000000-0000-4000-8000-000000000003"
        ]
      ]
    );
    expect(result.rows).toEqual([{ count: "3" }]);
  });

  it.each([
    [
      "the same interval",
      "30000000-0000-4000-8000-000000000011",
      "2031-02-15T10:00:00.000Z",
      "2031-02-15T12:00:00.000Z"
    ],
    [
      "an interval crossing the start",
      "30000000-0000-4000-8000-000000000012",
      "2031-02-15T09:00:00.000Z",
      "2031-02-15T11:00:00.000Z"
    ],
    [
      "an interval crossing the end",
      "30000000-0000-4000-8000-000000000013",
      "2031-02-15T11:00:00.000Z",
      "2031-02-15T13:00:00.000Z"
    ],
    [
      "an interval contained by the existing booking",
      "30000000-0000-4000-8000-000000000014",
      "2031-02-15T10:30:00.000Z",
      "2031-02-15T11:30:00.000Z"
    ],
    [
      "an interval containing the existing booking",
      "30000000-0000-4000-8000-000000000015",
      "2031-02-15T09:00:00.000Z",
      "2031-02-15T13:00:00.000Z"
    ]
  ])(
    "rejects %s with PostgreSQL exclusion code 23P01",
    async (_case, id, startAt, endAt) => {
      await pool.query(
        `DELETE FROM "bookings"
       WHERE "room_id" = $1::uuid
         AND "start_at" >= $2::timestamptz
         AND "start_at" < $3::timestamptz`,
        [ROOM_ID, "2031-02-15T00:00:00.000Z", "2031-02-16T00:00:00.000Z"]
      );
      await insertBooking(
        pool,
        "30000000-0000-4000-8000-000000000010",
        "2031-02-15T10:00:00.000Z",
        "2031-02-15T12:00:00.000Z"
      );

      await expect(
        insertBooking(pool, id, startAt, endAt)
      ).rejects.toMatchObject({
        code: "23P01",
        constraint: "bookings_no_active_overlap"
      });

      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
       FROM "bookings"
       WHERE "room_id" = $1::uuid
         AND "start_at" >= $2::timestamptz
         AND "start_at" < $3::timestamptz`,
        [ROOM_ID, "2031-02-15T00:00:00.000Z", "2031-02-16T00:00:00.000Z"]
      );
      expect(result.rows).toEqual([{ count: "1" }]);
    }
  );

  it("allows an active booking to occupy a cancelled booking's interval", async () => {
    const startAt = "2031-03-15T10:00:00.000Z";
    const endAt = "2031-03-15T11:00:00.000Z";
    await insertBooking(
      pool,
      "30000000-0000-4000-8000-000000000021",
      startAt,
      endAt,
      "CANCELLED",
      "2031-03-14T10:00:00.000Z"
    );

    await expect(
      insertBooking(
        pool,
        "30000000-0000-4000-8000-000000000022",
        startAt,
        endAt
      )
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      "a zero-length interval",
      "30000000-0000-4000-8000-000000000031",
      "2031-04-15T10:00:00.000Z",
      "2031-04-15T10:00:00.000Z",
      "ACTIVE",
      null
    ],
    [
      "a reversed interval",
      "30000000-0000-4000-8000-000000000032",
      "2031-04-15T11:00:00.000Z",
      "2031-04-15T10:00:00.000Z",
      "ACTIVE",
      null
    ],
    [
      "an active booking with a cancellation timestamp",
      "30000000-0000-4000-8000-000000000033",
      "2031-04-15T10:00:00.000Z",
      "2031-04-15T11:00:00.000Z",
      "ACTIVE",
      "2031-04-14T10:00:00.000Z"
    ],
    [
      "a cancelled booking without a cancellation timestamp",
      "30000000-0000-4000-8000-000000000034",
      "2031-04-15T10:00:00.000Z",
      "2031-04-15T11:00:00.000Z",
      "CANCELLED",
      null
    ]
  ])(
    "rejects %s with PostgreSQL check code 23514",
    async (_case, id, startAt, endAt, status, cancelledAt) => {
      await expect(
        insertBooking(pool, id, startAt, endAt, status, cancelledAt)
      ).rejects.toMatchObject({ code: "23514" });
    }
  );
});

async function insertBooking(
  pool: Pool,
  id: string,
  startAt: string,
  endAt: string,
  status = "ACTIVE",
  cancelledAt: string | null = null
): Promise<void> {
  await pool.query(
    `INSERT INTO "bookings" (
       "id",
       "room_id",
       "user_id",
       "title",
       "start_at",
       "end_at",
       "status",
       "cancelled_at",
       "created_at",
       "updated_at"
     )
     VALUES (
       $1::uuid,
       $2::uuid,
       $3::uuid,
       $4,
       $5::timestamptz,
       $6::timestamptz,
       $7::"BookingStatus",
       $8::timestamptz,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
     )`,
    [
      id,
      ROOM_ID,
      USER_ID,
      "Перевірка обмеження",
      startAt,
      endAt,
      status,
      cancelledAt
    ]
  );
}

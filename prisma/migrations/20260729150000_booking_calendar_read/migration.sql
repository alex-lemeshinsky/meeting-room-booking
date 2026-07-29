CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_valid_interval_check" CHECK ("start_at" < "end_at"),
    CONSTRAINT "bookings_cancellation_status_check" CHECK (
      (
        "status" = 'ACTIVE'
        AND "cancelled_at" IS NULL
      )
      OR (
        "status" = 'CANCELLED'
        AND "cancelled_at" IS NOT NULL
      )
    )
);

-- CreateIndex
CREATE INDEX "bookings_room_id_start_at_idx" ON "bookings"("room_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_user_id_start_at_idx" ON "bookings"("user_id", "start_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_no_active_overlap"
EXCLUDE USING gist (
  "room_id" WITH =,
  tstzrange("start_at", "end_at", '[)') WITH &&
)
WHERE ("status" = 'ACTIVE');

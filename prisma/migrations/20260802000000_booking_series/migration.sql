-- CreateEnum
CREATE TYPE "RecurrenceRule" AS ENUM ('WEEKLY');

-- CreateTable
CREATE TABLE "booking_series" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "office_timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    "first_local_date" DATE NOT NULL,
    "first_local_start_time" TIME(0) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "occurrence_count" INTEGER NOT NULL,
    "rule" "RecurrenceRule" NOT NULL DEFAULT 'WEEKLY',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_series_office_timezone_check"
      CHECK ("office_timezone" = 'Europe/Kyiv'),
    CONSTRAINT "booking_series_duration_minutes_check"
      CHECK ("duration_minutes" BETWEEN 30 AND 240 AND "duration_minutes" % 30 = 0),
    CONSTRAINT "booking_series_occurrence_count_check"
      CHECK ("occurrence_count" BETWEEN 2 AND 52)
);

-- CreateIndex
CREATE INDEX "booking_series_user_id_created_at_idx" ON "booking_series"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_series_room_id_created_at_idx" ON "booking_series"("room_id", "created_at");

-- AddForeignKey
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "series_id" UUID,
ADD COLUMN "occurrence_index" INTEGER;

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_series_occurrence_pair_check"
  CHECK (("series_id" IS NULL) = ("occurrence_index" IS NULL)),
ADD CONSTRAINT "bookings_series_occurrence_index_check"
  CHECK ("occurrence_index" IS NULL OR "occurrence_index" BETWEEN 0 AND 51),
ADD CONSTRAINT "bookings_series_id_occurrence_index_key"
  UNIQUE ("series_id", "occurrence_index");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "booking_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "current_booking_id" UUID NOT NULL,
    "next_booking_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NEXT_BOOKING_STARTS',
    "message" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_booking_pair_key" UNIQUE ("type", "current_booking_id", "next_booking_id");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_current_booking_id_fkey" FOREIGN KEY ("current_booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_next_booking_id_fkey" FOREIGN KEY ("next_booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

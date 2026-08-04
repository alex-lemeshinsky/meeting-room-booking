import { getCurrentLocalWeekStart } from "@mrb/time/calendar";
import type { MyBookingsResponse } from "../api/contracts";
import { formatBookingInterval } from "../calendar/booking";

type MyBooking = MyBookingsResponse["bookings"][number];
type MyBookingState = MyBooking["state"];

export function bookingCalendarHref(
  booking: MyBooking,
  timezone: string
): string {
  const weekStart = getCurrentLocalWeekStart(
    timezone,
    1,
    new Date(booking.startAt)
  );

  return (
    `/rooms/${encodeURIComponent(booking.room.id)}` +
    `?week=${encodeURIComponent(weekStart)}`
  );
}

export function formatMyBookingInterval(
  booking: MyBooking,
  timezone: string
): string {
  return formatBookingInterval(booking.startAt, booking.endAt, timezone);
}

export function myBookingStateLabel(state: MyBookingState): string {
  return {
    ACTIVE: "Триває зараз",
    UPCOMING: "Майбутнє",
    COMPLETED: "Завершено",
    CANCELLED: "Скасовано"
  }[state];
}

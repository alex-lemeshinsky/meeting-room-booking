import { getKyivOfficeIntervals } from "@mrb/time/calendar";
import { intervalsOverlap, parseInterval } from "@mrb/time/interval";
import type { ScheduleResponse } from "../api/contracts";

const SLOT_DURATION_MS = 30 * 60 * 1_000;
const MAX_BOOKING_DURATION_MS = 4 * 60 * 60 * 1_000;

export interface BookingTimeOption {
  value: string;
  label: string;
}

export function buildBookingEndOptions(
  startAt: string,
  bookings: ScheduleResponse["bookings"],
  timezone: string
): BookingTimeOption[] {
  const start = Date.parse(startAt);
  const maximumEnd = start + MAX_BOOKING_DURATION_MS;
  const officeInterval = getKyivOfficeIntervals(
    startAt,
    new Date(maximumEnd + SLOT_DURATION_MS).toISOString()
  ).find(
    (interval) =>
      Date.parse(interval.start) <= start && Date.parse(interval.end) > start
  );

  if (officeInterval === undefined) return [];

  const latestEnd = Math.min(maximumEnd, Date.parse(officeInterval.end));
  const options: BookingTimeOption[] = [];

  for (
    let candidateEnd = start + SLOT_DURATION_MS;
    candidateEnd <= latestEnd;
    candidateEnd += SLOT_DURATION_MS
  ) {
    const overlaps = bookings.some((booking) =>
      intervalsOverlap(parseInterval(booking.startAt, booking.endAt), {
        start,
        end: candidateEnd
      })
    );
    if (overlaps) break;

    const value = new Date(candidateEnd).toISOString();
    options.push({
      value,
      label: formatTime(value, timezone)
    });
  }

  return options;
}

export function formatTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone
  }).format(new Date(instant));
}

export function formatBookingInterval(
  startAt: string,
  endAt: string,
  timezone: string
): string {
  const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone
  });
  const startDate = dateFormatter.format(new Date(startAt));
  const endDate = dateFormatter.format(new Date(endAt));
  const startTime = formatTime(startAt, timezone);
  const endTime = formatTime(endAt, timezone);

  return startDate === endDate
    ? `${startDate}, ${startTime}–${endTime}`
    : `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

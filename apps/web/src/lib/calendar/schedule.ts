import {
  getKyivOfficeIntervals,
  getLocalWeek,
  splitBookingIntoLocalFragments,
  type CalendarSlot
} from "@mrb/time";
import { browserApi } from "../api/browser";
import type { ScheduleResponse } from "../api/contracts";

const SLOT_DURATION_MS = 30 * 60 * 1000;
const MINUTES_PER_SLOT = 30;
const MINUTES_PER_DAY = 24 * 60;

export interface ScheduleRequest {
  queryKey: readonly [
    "schedule",
    roomId: string,
    weekStart: string,
    timezone: string
  ];
  from: string;
  to: string;
  url: string;
}

export interface CalendarLayoutSlot extends CalendarSlot {
  isOffice: boolean;
}

export interface CalendarLayoutDay {
  localDate: string;
  label: string;
  isToday: boolean;
  slots: CalendarLayoutSlot[];
}

export interface CalendarLayoutBooking {
  bookingId: string;
  title: string;
  organizerName: string;
  isOwn: boolean;
  localDate: string;
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  startSlotIndex: number;
  slotSpan: number;
}

export interface CalendarLayout {
  range: {
    startMinute: number;
    endMinute: number;
    isFullDay: boolean;
  };
  days: CalendarLayoutDay[];
  bookings: CalendarLayoutBooking[];
  now:
    | {
        localDate: string;
        slotId: string;
        offsetPercent: number;
      }
    | undefined;
}

interface BuildCalendarLayoutOptions {
  response: ScheduleResponse;
  weekStart: string;
  timezone: string;
  now?: Date;
}

export function createScheduleRequest(
  roomId: string,
  weekStart: string,
  timezone: string
): ScheduleRequest {
  const { from, to } = getLocalWeek(weekStart, timezone);
  const roomPath = encodeURIComponent(roomId);

  return {
    queryKey: ["schedule", roomId, weekStart, timezone],
    from,
    to,
    url:
      `/api/v1/rooms/${roomPath}/schedule` +
      `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  };
}

export async function fetchSchedule(
  request: ScheduleRequest
): Promise<ScheduleResponse> {
  return browserApi<ScheduleResponse>(request.url, {
    method: "GET",
    credentials: "same-origin"
  });
}

export function buildCalendarLayout({
  response,
  weekStart,
  timezone,
  now = new Date()
}: BuildCalendarLayoutOptions): CalendarLayout {
  const week = getLocalWeek(weekStart, timezone, now);
  const localDates = new Set(week.days.map((day) => day.localDate));
  const officeIntervals = getKyivOfficeIntervals(week.from, week.to);
  const officeFragmentGroups = officeIntervals.map((interval, index) =>
    splitBookingIntoLocalFragments(
      `office-${index}`,
      interval.start,
      interval.end,
      timezone
    )
  );
  const officeFragments = officeFragmentGroups.flat();
  const visibleOfficeFragments = officeFragments.filter((fragment) =>
    localDates.has(fragment.localDate)
  );
  const crossesLocalMidnight = officeFragmentGroups.some(
    (fragments) => fragments.length > 1
  );
  const range = buildVisibleRange(visibleOfficeFragments, crossesLocalMidnight);
  const days = week.days.map((day) => ({
    localDate: day.localDate,
    label: day.label,
    isToday: day.isToday,
    slots: day.slots
      .filter(
        (slot) =>
          slot.minuteOfDay >= range.startMinute &&
          slot.minuteOfDay < range.endMinute
      )
      .map((slot) => ({
        ...slot,
        isOffice: officeIntervals.some(
          (interval) =>
            slot.instant >= interval.start && slot.instant < interval.end
        )
      }))
  }));

  return {
    range,
    days,
    bookings: buildBookingFragments(response.bookings, days, range, timezone),
    now: buildNowIndicator(days, now)
  };
}

function buildVisibleRange(
  officeFragments: Array<{ startMinute: number; endMinute: number }>,
  crossesLocalMidnight: boolean
): CalendarLayout["range"] {
  if (crossesLocalMidnight || officeFragments.length === 0) {
    return {
      startMinute: 0,
      endMinute: MINUTES_PER_DAY,
      isFullDay: true
    };
  }

  let earliestMinute = MINUTES_PER_DAY;
  let latestMinute = 0;

  for (const fragment of officeFragments) {
    earliestMinute = Math.min(earliestMinute, fragment.startMinute);
    latestMinute = Math.max(latestMinute, fragment.endMinute);
  }

  return {
    startMinute:
      Math.floor(earliestMinute / MINUTES_PER_SLOT) * MINUTES_PER_SLOT,
    endMinute: Math.ceil(latestMinute / MINUTES_PER_SLOT) * MINUTES_PER_SLOT,
    isFullDay: false
  };
}

function buildBookingFragments(
  bookings: ScheduleResponse["bookings"],
  days: CalendarLayoutDay[],
  range: CalendarLayout["range"],
  timezone: string
): CalendarLayoutBooking[] {
  const dayByDate = new Map(days.map((day) => [day.localDate, day]));

  return bookings.flatMap((booking) => {
    const bookingStart = Date.parse(booking.startAt);
    const bookingEnd = Date.parse(booking.endAt);

    return splitBookingIntoLocalFragments(
      booking.id,
      booking.startAt,
      booking.endAt,
      timezone
    ).flatMap((fragment) => {
      const day = dayByDate.get(fragment.localDate);
      const startMinute = Math.max(fragment.startMinute, range.startMinute);
      const endMinute = Math.min(fragment.endMinute, range.endMinute);

      if (day === undefined || endMinute <= startMinute) {
        return [];
      }

      const occupiedSlotIndexes = day.slots.flatMap((slot, index) => {
        const slotStart = Date.parse(slot.instant);
        const slotEnd = slotStart + SLOT_DURATION_MS;
        return slotStart < bookingEnd && slotEnd > bookingStart ? [index] : [];
      });
      const startSlotIndex = occupiedSlotIndexes[0];
      const endSlotIndex = occupiedSlotIndexes[occupiedSlotIndexes.length - 1];

      if (startSlotIndex === undefined || endSlotIndex === undefined) {
        return [];
      }

      return [
        {
          bookingId: booking.id,
          title: booking.title,
          organizerName: booking.organizer.name,
          isOwn: booking.isOwn,
          localDate: fragment.localDate,
          startMinute,
          endMinute,
          continuesBefore:
            fragment.continuesBefore ||
            fragment.startMinute < range.startMinute,
          continuesAfter:
            fragment.continuesAfter || fragment.endMinute > range.endMinute,
          startSlotIndex,
          slotSpan: endSlotIndex - startSlotIndex + 1
        }
      ];
    });
  });
}

function buildNowIndicator(
  days: CalendarLayoutDay[],
  now: Date
): CalendarLayout["now"] {
  const nowInstant = now.getTime();

  for (const day of days) {
    if (!day.isToday) {
      continue;
    }

    const slot = day.slots.find((candidate) => {
      const slotStart = Date.parse(candidate.instant);
      return (
        slotStart <= nowInstant && nowInstant < slotStart + SLOT_DURATION_MS
      );
    });

    if (slot !== undefined) {
      const slotStart = Date.parse(slot.instant);
      return {
        localDate: day.localDate,
        slotId: slot.id,
        offsetPercent: ((nowInstant - slotStart) / SLOT_DURATION_MS) * 100
      };
    }
  }

  return undefined;
}

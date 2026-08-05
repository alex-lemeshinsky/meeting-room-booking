import {
  getKyivOfficeIntervals,
  getLocalWeek,
  splitBookingIntoLocalFragments,
  type CalendarSlot
} from "@mrb/time/calendar";
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
    timezone: string,
    weekStartsOn: number
  ];
  from: string;
  to: string;
  url: string;
}

interface CalendarLayoutSlot extends CalendarSlot {
  bookingStartAt?: string;
  bookingStartLabel?: string;
  elapsedPercent: number;
  isOffice: boolean;
  officeStartPercent: number;
  officeEndPercent: number;
  rowIndex: number;
}

interface CalendarRow {
  id: string;
  label: string;
  minuteOfDay: number;
  offsetLabel?: string;
}

interface CalendarLayoutDay {
  localDate: string;
  label: string;
  fullDateLabel: string;
  isToday: boolean;
  slots: CalendarLayoutSlot[];
}

interface CalendarLayoutBooking {
  bookingId: string;
  title: string;
  organizerName: string;
  isOwn: boolean;
  localDate: string;
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  startRowIndex: number;
  startOffsetPercent: number;
  heightInRows: number;
  accessibleLabel: string;
  isRecurring: boolean;
  seriesId?: string | undefined;
  occurrenceIndex?: number | undefined;
  occurrenceCount?: number | undefined;
}

export interface CalendarLayout {
  range: {
    startMinute: number;
    endMinute: number;
    isFullDay: boolean;
  };
  rows: CalendarRow[];
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
  weekStartsOn: number;
  now?: Date;
}

export function createScheduleRequest(
  roomId: string,
  weekStart: string,
  timezone: string,
  weekStartsOn: number
): ScheduleRequest {
  const { from, to } = getLocalWeek(weekStart, timezone, weekStartsOn);
  const roomPath = encodeURIComponent(roomId);

  return {
    queryKey: ["schedule", roomId, weekStart, timezone, weekStartsOn],
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
  weekStartsOn,
  now = new Date()
}: BuildCalendarLayoutOptions): CalendarLayout {
  const week = getLocalWeek(weekStart, timezone, weekStartsOn, now);
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
  const visibleDays = week.days.map((day) => ({
    localDate: day.localDate,
    label: day.label,
    fullDateLabel: day.fullDateLabel,
    isToday: day.isToday,
    slots: day.slots.filter(
      (slot) =>
        slot.minuteOfDay >= range.startMinute &&
        slot.minuteOfDay < range.endMinute
    )
  }));
  const rows = buildCalendarRows(visibleDays);
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  const days = visibleDays.map((day) => {
    const occurrences = new Map<number, number>();

    return {
      ...day,
      slots: day.slots.map((slot) => {
        const occurrence = occurrences.get(slot.minuteOfDay) ?? 0;
        occurrences.set(slot.minuteOfDay, occurrence + 1);
        const rowIndex = rowIndexById.get(
          calendarRowId(slot.minuteOfDay, occurrence)
        );
        if (rowIndex === undefined) {
          throw new RangeError("Calendar slot has no shared row");
        }

        const officeCoverage = getOfficeCoverage(slot, officeIntervals);
        const bookingStartAt = getBookingStartAt(
          slot,
          officeIntervals,
          response.bookings,
          now
        );
        return {
          ...slot,
          ...officeCoverage,
          ...(bookingStartAt === undefined
            ? {}
            : {
                bookingStartAt,
                bookingStartLabel: formatInstantTime(bookingStartAt, timezone)
              }),
          elapsedPercent: getElapsedCoverage(slot, day.isToday, now),
          isOffice:
            officeCoverage.officeEndPercent > officeCoverage.officeStartPercent,
          rowIndex
        };
      })
    };
  });

  return {
    range,
    rows,
    days,
    bookings: buildBookingFragments(response.bookings, days, timezone),
    now: buildNowIndicator(days, now)
  };
}

function formatInstantTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone
  }).format(new Date(instant));
}

function getBookingStartAt(
  slot: CalendarSlot,
  officeIntervals: Array<{ start: string; end: string }>,
  bookings: ScheduleResponse["bookings"],
  now: Date
): string | undefined {
  const slotStart = Date.parse(slot.instant);
  const slotEnd = slotStart + SLOT_DURATION_MS;

  for (const interval of officeIntervals) {
    const officeStart = Date.parse(interval.start);
    const officeEnd = Date.parse(interval.end);
    const gridOffset = Math.max(
      0,
      Math.ceil((slotStart - officeStart) / SLOT_DURATION_MS)
    );
    const candidateStart = officeStart + gridOffset * SLOT_DURATION_MS;
    const candidateEnd = candidateStart + SLOT_DURATION_MS;

    if (
      candidateStart < slotStart ||
      candidateStart >= slotEnd ||
      candidateEnd > officeEnd ||
      candidateStart <= now.getTime()
    ) {
      continue;
    }

    const overlaps = bookings.some(
      (booking) =>
        Date.parse(booking.startAt) < candidateEnd &&
        Date.parse(booking.endAt) > candidateStart
    );
    if (!overlaps) {
      return new Date(candidateStart).toISOString();
    }
  }

  return undefined;
}

function buildCalendarRows(
  days: Array<{
    slots: CalendarSlot[];
  }>
): CalendarRow[] {
  const templateDay = days.reduce((template, day) =>
    day.slots.length > template.slots.length ? day : template
  );
  const occurrences = new Map<number, number>();

  return templateDay.slots.map((slot) => {
    const occurrence = occurrences.get(slot.minuteOfDay) ?? 0;
    occurrences.set(slot.minuteOfDay, occurrence + 1);

    return {
      id: calendarRowId(slot.minuteOfDay, occurrence),
      label: slot.label,
      minuteOfDay: slot.minuteOfDay,
      ...(slot.offsetLabel === undefined
        ? {}
        : { offsetLabel: slot.offsetLabel })
    };
  });
}

function calendarRowId(minuteOfDay: number, occurrence: number): string {
  return `${minuteOfDay}-${occurrence}`;
}

function getOfficeCoverage(
  slot: CalendarSlot,
  officeIntervals: Array<{ start: string; end: string }>
): {
  officeStartPercent: number;
  officeEndPercent: number;
} {
  const slotStart = Date.parse(slot.instant);
  const slotEnd = slotStart + SLOT_DURATION_MS;
  let officeStart = slotEnd;
  let officeEnd = slotStart;

  for (const interval of officeIntervals) {
    const overlapStart = Math.max(slotStart, Date.parse(interval.start));
    const overlapEnd = Math.min(slotEnd, Date.parse(interval.end));

    if (overlapStart < overlapEnd) {
      officeStart = Math.min(officeStart, overlapStart);
      officeEnd = Math.max(officeEnd, overlapEnd);
    }
  }

  if (officeStart >= officeEnd) {
    return {
      officeStartPercent: 0,
      officeEndPercent: 0
    };
  }

  return {
    officeStartPercent: ((officeStart - slotStart) / SLOT_DURATION_MS) * 100,
    officeEndPercent: ((officeEnd - slotStart) / SLOT_DURATION_MS) * 100
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

      if (day === undefined) {
        return [];
      }

      const occupiedSlots = day.slots.filter((slot) => {
        const slotStart = Date.parse(slot.instant);
        const slotEnd = slotStart + SLOT_DURATION_MS;
        return slotStart < bookingEnd && slotEnd > bookingStart;
      });
      const firstSlot = occupiedSlots[0];
      const lastSlot = occupiedSlots[occupiedSlots.length - 1];

      if (firstSlot === undefined || lastSlot === undefined) {
        return [];
      }

      const firstSlotStart = Date.parse(firstSlot.instant);
      const lastSlotStart = Date.parse(lastSlot.instant);
      const visibleStart = Math.max(bookingStart, firstSlotStart);
      const visibleEnd = Math.min(bookingEnd, lastSlotStart + SLOT_DURATION_MS);
      if (visibleStart >= visibleEnd) {
        return [];
      }

      const startOffsetPercent =
        ((visibleStart - firstSlotStart) / SLOT_DURATION_MS) * 100;
      const endOffset = (visibleEnd - lastSlotStart) / SLOT_DURATION_MS;
      const startPosition = firstSlot.rowIndex + startOffsetPercent / 100;
      const endPosition = lastSlot.rowIndex + endOffset;
      const startMinute =
        firstSlot.minuteOfDay + (visibleStart - firstSlotStart) / 60_000;
      const exactEndSlot = day.slots.find(
        (slot) => Date.parse(slot.instant) === visibleEnd
      );
      const endMinute =
        exactEndSlot?.minuteOfDay ??
        lastSlot.minuteOfDay + (visibleEnd - lastSlotStart) / 60_000;
      const startLabel = formatLocalMinute(startMinute, firstSlot.offsetLabel);
      const endLabel = formatLocalMinute(
        endMinute,
        exactEndSlot?.offsetLabel ?? lastSlot.offsetLabel
      );
      const ownershipLabel = booking.isOwn
        ? "Моє"
        : `Організатор: ${booking.organizer.name}`;

      const isRecurring =
        booking.seriesId != null &&
        booking.occurrenceIndex != null &&
        booking.occurrenceCount != null;

      const recurrenceLabel = isRecurring
        ? `. Частина повторюваної серії (${(booking.occurrenceIndex ?? 0) + 1} з ${booking.occurrenceCount})`
        : "";

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
            fragment.continuesBefore || bookingStart < visibleStart,
          continuesAfter: fragment.continuesAfter || bookingEnd > visibleEnd,
          startRowIndex: firstSlot.rowIndex,
          startOffsetPercent,
          heightInRows: endPosition - startPosition,
          accessibleLabel:
            `${booking.title}. ${day.fullDateLabel}, ` +
            `${startLabel}–${endLabel}. ${ownershipLabel}${recurrenceLabel}`,
          isRecurring,
          ...(isRecurring
            ? {
                seriesId: booking.seriesId ?? undefined,
                occurrenceIndex: booking.occurrenceIndex ?? undefined,
                occurrenceCount: booking.occurrenceCount ?? undefined
              }
            : {})
        }
      ];
    });
  });
}

function formatLocalMinute(minuteOfDay: number, offsetLabel?: string): string {
  const wholeMinute = Math.floor(minuteOfDay);
  const hour = Math.floor(wholeMinute / 60)
    .toString()
    .padStart(2, "0");
  const minute = (wholeMinute % 60).toString().padStart(2, "0");
  const time = `${hour}:${minute}`;

  return offsetLabel === undefined ? time : `${time} ${offsetLabel}`;
}

function getElapsedCoverage(
  slot: CalendarSlot,
  isToday: boolean,
  now: Date
): number {
  if (!isToday) {
    return 0;
  }

  const elapsed =
    ((now.getTime() - Date.parse(slot.instant)) / SLOT_DURATION_MS) * 100;
  return Math.min(100, Math.max(0, elapsed));
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

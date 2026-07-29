import { DateTime, IANAZone } from "luxon";

const KYIV_TIMEZONE = "Europe/Kyiv";
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /T.*(?:Z|[+-]\d{2}:\d{2})$/i;

export interface CalendarSlot {
  id: string;
  instant: string;
  localDate: string;
  label: string;
  offsetLabel?: string;
}

export interface CalendarDay {
  localDate: string;
  label: string;
  isToday: boolean;
  slots: CalendarSlot[];
}

export interface BookingFragment {
  bookingId: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export function getLocalWeek(
  weekStart: string,
  timezone: string,
  now: Date = new Date()
): { from: string; to: string; days: CalendarDay[] } {
  assertTimezone(timezone);
  const start = parseLocalDate(weekStart, "weekStart", timezone);
  if (start.weekday !== 1) {
    throw new RangeError("weekStart must be a Monday local date");
  }

  const localNow = parseNow(now, timezone);
  const today = requiredIsoDate(localNow);
  const end = start.plus({ days: 7 });
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = start.plus({ days: index });

    return {
      localDate: requiredIsoDate(day),
      label: day.setLocale("en-US").toFormat("ccc, LLL d"),
      isToday: requiredIsoDate(day) === today,
      slots: buildCalendarSlots(day, timezone)
    };
  });

  return {
    from: requiredUtcIso(start),
    to: requiredUtcIso(end),
    days
  };
}

export function getCurrentLocalWeekStart(
  timezone: string,
  now: Date = new Date()
): string {
  assertTimezone(timezone);
  const localNow = parseNow(now, timezone);
  return requiredIsoDate(
    localNow.startOf("day").minus({ days: localNow.weekday - 1 })
  );
}

export function getKyivOfficeIntervals(
  from: string,
  to: string
): Array<{ officeDate: string; start: string; end: string }> {
  const fromInstant = parseInstant(from, "from");
  const toInstant = parseInstant(to, "to");
  assertOrderedInterval(fromInstant, toInstant, "from", "to");

  const queryStart = fromInstant.toMillis();
  const queryEnd = toInstant.toMillis();
  const firstOfficeDate = fromInstant.setZone(KYIV_TIMEZONE).startOf("day");
  const finalOfficeDate = toInstant.setZone(KYIV_TIMEZONE).startOf("day");
  const intervals: Array<{
    officeDate: string;
    start: string;
    end: string;
  }> = [];

  for (
    let officeDate = firstOfficeDate;
    officeDate <= finalOfficeDate;
    officeDate = officeDate.plus({ days: 1 })
  ) {
    const officeStart = officeDate.set({
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0
    });
    const officeEnd = officeDate.set({
      hour: 19,
      minute: 0,
      second: 0,
      millisecond: 0
    });

    if (
      officeStart.toMillis() < queryEnd &&
      officeEnd.toMillis() > queryStart
    ) {
      intervals.push({
        officeDate: requiredIsoDate(officeDate),
        start: requiredUtcIso(officeStart),
        end: requiredUtcIso(officeEnd)
      });
    }
  }

  return intervals;
}

export function splitBookingIntoLocalFragments(
  bookingId: string,
  startAt: string,
  endAt: string,
  timezone: string
): BookingFragment[] {
  assertTimezone(timezone);
  const start = parseInstant(startAt, "startAt");
  const end = parseInstant(endAt, "endAt");
  assertOrderedInterval(start, end, "startAt", "endAt");

  const fragments: BookingFragment[] = [];
  let fragmentStart = start;

  while (fragmentStart < end) {
    const localStart = fragmentStart.setZone(timezone);
    const nextLocalMidnight = localStart
      .startOf("day")
      .plus({ days: 1 })
      .toUTC();
    const fragmentEnd = nextLocalMidnight < end ? nextLocalMidnight : end;
    const localEnd = fragmentEnd.setZone(timezone);
    const endsAtNextLocalMidnight =
      fragmentEnd.equals(nextLocalMidnight) &&
      requiredIsoDate(localEnd) !== requiredIsoDate(localStart);

    fragments.push({
      bookingId,
      localDate: requiredIsoDate(localStart),
      startMinute: minuteOfDay(localStart),
      endMinute: endsAtNextLocalMidnight ? 24 * 60 : minuteOfDay(localEnd),
      continuesBefore: fragmentStart > start,
      continuesAfter: fragmentEnd < end
    });

    fragmentStart = fragmentEnd;
  }

  return fragments;
}

function buildCalendarSlots(
  localDay: DateTime,
  timezone: string
): CalendarSlot[] {
  const dayEnd = localDay.plus({ days: 1 }).toUTC();
  const slots: Array<CalendarSlot & { offsetLabel: string }> = [];

  for (
    let instant = localDay.toUTC();
    instant < dayEnd;
    instant = instant.plus({ minutes: 30 })
  ) {
    const localSlot = instant.setZone(timezone);
    const utcInstant = requiredUtcIso(instant);

    slots.push({
      id: utcInstant,
      instant: utcInstant,
      localDate: requiredIsoDate(localSlot),
      label: localSlot.toFormat("HH:mm"),
      offsetLabel: `UTC${localSlot.toFormat("ZZ")}`
    });
  }

  const labelCounts = new Map<string, number>();
  for (const slot of slots) {
    labelCounts.set(slot.label, (labelCounts.get(slot.label) ?? 0) + 1);
  }

  return slots.map(({ offsetLabel, ...slot }) =>
    labelCounts.get(slot.label) === 1 ? slot : { ...slot, offsetLabel }
  );
}

function assertTimezone(timezone: string): void {
  if (!IANAZone.isValidZone(timezone)) {
    throw new RangeError(`timezone must be a valid IANA zone: ${timezone}`);
  }
}

function parseLocalDate(
  value: string,
  name: string,
  timezone: string
): DateTime {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    throw new RangeError(`${name} must be a valid ISO local date`);
  }

  const result = DateTime.fromISO(value, { zone: timezone }).startOf("day");
  if (!result.isValid || result.toISODate() !== value) {
    throw new RangeError(`${name} must be a valid ISO local date`);
  }

  return result;
}

function parseInstant(value: string, name: string): DateTime {
  if (!INSTANT_PATTERN.test(value)) {
    throw new RangeError(`${name} must be a valid ISO 8601 instant`);
  }

  const result = DateTime.fromISO(value, { setZone: true });
  if (!result.isValid) {
    throw new RangeError(`${name} must be a valid ISO 8601 instant`);
  }

  return result.toUTC();
}

function parseNow(now: Date, timezone: string): DateTime {
  const result = DateTime.fromJSDate(now, { zone: timezone });
  if (!result.isValid) {
    throw new RangeError("now must be a valid instant");
  }

  return result;
}

function assertOrderedInterval(
  start: DateTime,
  end: DateTime,
  startName: string,
  endName: string
): void {
  if (start >= end) {
    throw new RangeError(`${startName} must be before ${endName}`);
  }
}

function requiredIsoDate(value: DateTime): string {
  const result = value.toISODate();
  if (result === null) {
    throw new RangeError("Unable to format invalid local date");
  }
  return result;
}

function requiredUtcIso(value: DateTime): string {
  const result = value.toUTC().toISO();
  if (result === null) {
    throw new RangeError("Unable to format invalid instant");
  }
  return result;
}

function minuteOfDay(value: DateTime): number {
  return (
    value.hour * 60 +
    value.minute +
    value.second / 60 +
    value.millisecond / 60_000
  );
}

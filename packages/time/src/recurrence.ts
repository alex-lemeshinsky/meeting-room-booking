import { DateTime } from "luxon";

const KYIV_TIMEZONE = "Europe/Kyiv";
const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export interface KyivWeeklyOccurrence {
  occurrenceIndex: number;
  startAt: string;
  endAt: string;
}

export interface KyivWeeklySeriesProjection {
  firstLocalDate: string;
  firstLocalStartTime: string;
  durationMinutes: number;
  occurrences: KyivWeeklyOccurrence[];
}

export function buildKyivWeeklySeries(
  startAt: string,
  endAt: string,
  occurrenceCount: number
): KyivWeeklySeriesProjection {
  const start = parseUtcInstant(startAt, "startAt");
  const end = parseUtcInstant(endAt, "endAt");
  assertOccurrenceCount(occurrenceCount);

  if (end <= start) {
    throw new RangeError("endAt must be after startAt");
  }

  const durationMinutes = end.diff(start, "minutes").minutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes % 30 !== 0) {
    throw new RangeError("duration must be divisible by 30 minutes");
  }

  const firstLocalStart = start.setZone(KYIV_TIMEZONE);

  return {
    firstLocalDate: requiredIsoDate(firstLocalStart),
    firstLocalStartTime: firstLocalStart.toFormat("HH:mm:ss"),
    durationMinutes,
    occurrences: Array.from(
      { length: occurrenceCount },
      (_, occurrenceIndex) => {
        const localStart = firstLocalStart.plus({ weeks: occurrenceIndex });
        const localEnd = localStart.plus({ minutes: durationMinutes });

        return {
          occurrenceIndex,
          startAt: requiredUtcIso(reconstructLocalDateTime(localStart)),
          endAt: requiredUtcIso(reconstructLocalDateTime(localEnd))
        };
      }
    )
  };
}

function parseUtcInstant(value: string, name: string): DateTime {
  if (!UTC_INSTANT_PATTERN.test(value)) {
    throw new RangeError(`${name} must be a valid UTC ISO 8601 instant`);
  }

  const result = DateTime.fromISO(value, { setZone: true });
  if (!result.isValid) {
    throw new RangeError(`${name} must be a valid UTC ISO 8601 instant`);
  }

  return result.toUTC();
}

function assertOccurrenceCount(occurrenceCount: number): void {
  if (
    !Number.isInteger(occurrenceCount) ||
    occurrenceCount < 2 ||
    occurrenceCount > 52
  ) {
    throw new RangeError(
      "occurrenceCount must be an integer from 2 through 52"
    );
  }
}

function reconstructLocalDateTime(value: DateTime): DateTime {
  const expected = requiredLocalDateTime(value);
  const result = DateTime.fromISO(expected, { zone: KYIV_TIMEZONE });

  if (!result.isValid || requiredLocalDateTime(result) !== expected) {
    throw new RangeError(
      "weekly occurrence must be a valid Kyiv local date and time"
    );
  }

  return result;
}

function requiredIsoDate(value: DateTime): string {
  const result = value.toISODate();
  if (result === null) {
    throw new RangeError("date must be valid");
  }

  return result;
}

function requiredLocalDateTime(value: DateTime): string {
  return `${requiredIsoDate(value)}T${value.toFormat("HH:mm:ss.SSS")}`;
}

function requiredUtcIso(value: DateTime): string {
  const result = value.toUTC().toISO();
  if (result === null) {
    throw new RangeError("instant must be valid");
  }

  return result;
}

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
        if (occurrenceIndex === 0) {
          return buildOccurrence(occurrenceIndex, start, end);
        }

        const localDate = firstLocalStart
          .startOf("day")
          .plus({ weeks: occurrenceIndex });
        const localStart = resolveKyivLocalDateTime(localDate, firstLocalStart);
        const localEnd = localStart.plus({ minutes: durationMinutes });

        return buildOccurrence(occurrenceIndex, localStart, localEnd);
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

function resolveKyivLocalDateTime(date: DateTime, time: DateTime): DateTime {
  const expected = `${requiredIsoDate(date)}T${time.toFormat("HH:mm:ss.SSS")}`;
  const reconstructed = DateTime.fromISO(expected, { zone: KYIV_TIMEZONE });

  if (
    !reconstructed.isValid ||
    requiredLocalDateTime(reconstructed) !== expected
  ) {
    throw new RangeError(
      "weekly occurrence must be a valid Kyiv local date and time"
    );
  }

  return reconstructed
    .getPossibleOffsets()
    .sort((left, right) => left.toMillis() - right.toMillis())[0]!;
}

function buildOccurrence(
  occurrenceIndex: number,
  start: DateTime,
  end: DateTime
): KyivWeeklyOccurrence {
  assertReconstructedKyivLocalInstant(start);
  assertReconstructedKyivLocalInstant(end);

  if (end <= start) {
    throw new RangeError("weekly occurrence end must be after its start");
  }

  return {
    occurrenceIndex,
    startAt: requiredUtcIso(start),
    endAt: requiredUtcIso(end)
  };
}

function assertReconstructedKyivLocalInstant(value: DateTime): void {
  const localValue = value.setZone(KYIV_TIMEZONE);
  const expected = requiredLocalDateTime(localValue);
  const reconstructed = DateTime.fromISO(expected, { zone: KYIV_TIMEZONE });

  if (
    !reconstructed.isValid ||
    requiredLocalDateTime(reconstructed) !== expected ||
    !reconstructed
      .getPossibleOffsets()
      .some((candidate) => candidate.toMillis() === localValue.toMillis())
  ) {
    throw new RangeError(
      "weekly occurrence must be a valid Kyiv local date and time"
    );
  }
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

import { getKyivOfficeIntervals } from "@mrb/time";
import { AppError } from "../common/errors/app-error.js";

const MIN_DURATION_MS = 30 * 60 * 1_000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1_000;
const GRID_INTERVAL_MS = 30 * 60 * 1_000;

export interface CreateBookingPolicyInput {
  title: string;
  startAt: string;
  endAt: string;
}

export interface ValidatedBooking {
  title: string;
  startAt: Date;
  endAt: Date;
}

export function validateCreateBooking(
  input: CreateBookingPolicyInput,
  now: Date
): ValidatedBooking {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 100) {
    throw new AppError(
      400,
      "INVALID_BOOKING_TITLE",
      "Booking title is invalid",
      { title: ["Title must contain between 1 and 100 characters"] }
    );
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const duration = endAt.getTime() - startAt.getTime();

  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
    throw new AppError(
      400,
      "INVALID_BOOKING_DURATION",
      "Booking duration is invalid",
      {
        startAt: ["Booking must last between 30 minutes and 4 hours"],
        endAt: ["Booking must last between 30 minutes and 4 hours"]
      }
    );
  }

  if (startAt.getTime() <= now.getTime()) {
    throw new AppError(
      400,
      "BOOKING_NOT_IN_FUTURE",
      "Booking must start in the future",
      { startAt: ["Choose a start time later than the current server time"] }
    );
  }

  const officeIntervals = getKyivOfficeIntervals(
    startAt.toISOString(),
    endAt.toISOString()
  );
  const containingOfficeInterval = officeIntervals.find(
    (interval) =>
      new Date(interval.start).getTime() <= startAt.getTime() &&
      new Date(interval.end).getTime() >= endAt.getTime()
  );

  if (containingOfficeInterval === undefined) {
    throw new AppError(
      400,
      "BOOKING_OUTSIDE_OFFICE_HOURS",
      "Booking must remain within Kyiv office hours",
      {
        startAt: ["Choose a time within 09:00–19:00 Europe/Kyiv"],
        endAt: ["Choose a time within 09:00–19:00 Europe/Kyiv"]
      }
    );
  }

  const officeStart = new Date(containingOfficeInterval.start).getTime();
  if (
    (startAt.getTime() - officeStart) % GRID_INTERVAL_MS !== 0 ||
    (endAt.getTime() - officeStart) % GRID_INTERVAL_MS !== 0
  ) {
    throw new AppError(
      400,
      "BOOKING_OFF_GRID",
      "Booking times must use the 30-minute office grid",
      {
        startAt: ["Choose a 30-minute grid boundary"],
        endAt: ["Choose a 30-minute grid boundary"]
      }
    );
  }

  return { title, startAt, endAt };
}

import { AppError } from "../common/errors/app-error.js";

export type MyBookingsSection = "upcoming" | "history";
export type MyBookingState = "ACTIVE" | "UPCOMING" | "COMPLETED" | "CANCELLED";

export interface MyBookingRecord {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: "ACTIVE" | "CANCELLED";
  cancelledAt: Date | null;
  seriesId: string | null;
  occurrenceIndex: number | null;
  series: {
    occurrenceCount: number;
  } | null;
  room: {
    id: string;
    name: string;
  };
}

export interface MyBooking {
  id: string;
  room: {
    id: string;
    name: string;
  };
  title: string;
  startAt: string;
  endAt: string;
  state: MyBookingState;
  seriesId: string | null;
  occurrenceIndex: number | null;
  occurrenceCount: number | null;
}

interface HistoryCursor {
  version: 1;
  startAt: string;
  id: string;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mapMyBooking(booking: MyBookingRecord, now: Date): MyBooking {
  const state: MyBookingState =
    booking.status === "CANCELLED"
      ? "CANCELLED"
      : booking.endAt <= now
        ? "COMPLETED"
        : booking.startAt <= now
          ? "ACTIVE"
          : "UPCOMING";

  return {
    id: booking.id,
    room: booking.room,
    title: booking.title,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    state,
    seriesId: booking.seriesId,
    occurrenceIndex: booking.occurrenceIndex,
    occurrenceCount: booking.series?.occurrenceCount ?? null
  };
}

export function encodeHistoryCursor(booking: MyBookingRecord): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      startAt: booking.startAt.toISOString(),
      id: booking.id
    } satisfies HistoryCursor)
  ).toString("base64url");
}

export function decodeHistoryCursor(cursor: string): HistoryCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("startAt" in parsed) ||
      typeof parsed.startAt !== "string" ||
      new Date(parsed.startAt).toISOString() !== parsed.startAt ||
      !("id" in parsed) ||
      typeof parsed.id !== "string" ||
      !UUID_V4_PATTERN.test(parsed.id)
    ) {
      throw new Error("Cursor shape is invalid");
    }

    return {
      version: 1,
      startAt: parsed.startAt,
      id: parsed.id
    };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "History cursor is invalid", {
      cursor: ["Use a cursor returned by the previous history response"]
    });
  }
}

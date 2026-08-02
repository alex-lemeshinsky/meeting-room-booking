import {
  buildKyivWeeklySeries,
  type Clock,
  type KyivWeeklySeriesProjection
} from "@mrb/time";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateCreateBooking } from "../../src/bookings/booking-policy.js";
import type { BookingWritePolicyService } from "../../src/bookings/booking-write-policy.service.js";
import { AppError } from "../../src/common/errors/app-error.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import { RecurrenceService } from "../../src/recurrence/recurrence.service.js";

const { projectWeeklySeries } = vi.hoisted(() => ({
  projectWeeklySeries: vi.fn()
}));

vi.mock("@mrb/time", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  buildKyivWeeklySeries: projectWeeklySeries
}));

const NOW = new Date("2026-03-20T06:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const SERIES_ID = "20000000-0000-4000-8000-000000000001";

describe("RecurrenceService", () => {
  beforeEach(() => {
    vi.mocked(buildKyivWeeklySeries).mockReset();
    vi.mocked(buildKyivWeeklySeries).mockReturnValue(projection());
  });

  it("projects, validates, and creates ordered occurrences in one transaction", async () => {
    const database = databaseDouble();
    const clock = clockDouble();
    const policy = policyDouble();
    const service = new RecurrenceService(database, clock, policy);

    await expect(service.create(USER_ID, validInput())).resolves.toEqual({
      series: {
        id: SERIES_ID,
        roomId: ROOM_ID,
        title: "Щотижнева синхронізація",
        officeTimezone: "Europe/Kyiv",
        occurrenceCount: 3,
        rule: "WEEKLY"
      },
      occurrences: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          occurrenceIndex: 0,
          startAt: "2026-03-22T07:00:00.000Z",
          endAt: "2026-03-22T08:00:00.000Z"
        },
        {
          id: "30000000-0000-4000-8000-000000000002",
          occurrenceIndex: 1,
          startAt: "2026-03-29T06:00:00.000Z",
          endAt: "2026-03-29T07:00:00.000Z"
        },
        {
          id: "30000000-0000-4000-8000-000000000003",
          occurrenceIndex: 2,
          startAt: "2026-04-05T06:00:00.000Z",
          endAt: "2026-04-05T07:00:00.000Z"
        }
      ]
    });

    expect(clock.now).toHaveBeenCalledOnce();
    expect(policy.validateCandidate).toHaveBeenCalledTimes(4);
    expect(policy.validateCandidate).toHaveBeenNthCalledWith(
      1,
      validInput(),
      NOW
    );
    for (let call = 2; call <= 4; call += 1) {
      expect(policy.validateCandidate.mock.calls[call - 1]?.[1]).toBe(NOW);
    }
    expect(policy.assertContext).toHaveBeenCalledOnce();
    expect(policy.assertContext).toHaveBeenCalledWith(USER_ID, ROOM_ID);
    expect(buildKyivWeeklySeries).toHaveBeenCalledWith(
      "2026-03-22T07:00:00.000Z",
      "2026-03-22T08:00:00.000Z",
      3
    );
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(database.transaction.bookingSeries.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        roomId: ROOM_ID,
        title: "Щотижнева синхронізація",
        officeTimezone: "Europe/Kyiv",
        firstLocalDate: new Date("2026-03-22T00:00:00.000Z"),
        firstLocalStartTime: new Date("1970-01-01T09:00:00.000Z"),
        durationMinutes: 60,
        occurrenceCount: 3,
        rule: "WEEKLY"
      },
      select: {
        id: true,
        roomId: true,
        title: true,
        officeTimezone: true,
        occurrenceCount: true,
        rule: true
      }
    });
    expect(database.transaction.booking.create.mock.calls).toEqual(
      projection().occurrences.map((candidate) => [
        {
          data: {
            roomId: ROOM_ID,
            userId: USER_ID,
            seriesId: SERIES_ID,
            occurrenceIndex: candidate.occurrenceIndex,
            title: "Щотижнева синхронізація",
            startAt: new Date(candidate.startAt),
            endAt: new Date(candidate.endAt)
          },
          select: {
            id: true,
            occurrenceIndex: true,
            startAt: true,
            endAt: true
          }
        }
      ])
    );
  });

  it("validates the first request before owner and room context", async () => {
    const database = databaseDouble();
    const policy = policyDouble({
      validationError: new AppError(
        400,
        "INVALID_BOOKING_TITLE",
        "Booking title is invalid"
      )
    });
    const service = new RecurrenceService(database, clockDouble(), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      code: "INVALID_BOOKING_TITLE"
    });
    expect(policy.assertContext).not.toHaveBeenCalled();
    expect(buildKyivWeeklySeries).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("passes context errors through before projection or persistence", async () => {
    const database = databaseDouble();
    const policy = policyDouble({
      contextError: new AppError(404, "ROOM_NOT_FOUND", "Room not found")
    });
    const service = new RecurrenceService(database, clockDouble(), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      code: "ROOM_NOT_FOUND"
    });
    expect(buildKyivWeeklySeries).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("maps a projection RangeError to INVALID_RECURRENCE_OCCURRENCE", async () => {
    vi.mocked(buildKyivWeeklySeries).mockImplementation(() => {
      throw new RangeError("weekly occurrence is in a Kyiv gap");
    });
    const database = databaseDouble();
    const service = new RecurrenceService(
      database,
      clockDouble(),
      policyDouble()
    );

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      status: 400,
      code: "INVALID_RECURRENCE_OCCURRENCE"
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("maps an overlap to the one-based conflicting occurrence and aborts", async () => {
    const overlap = new Error("exclusion constraint");
    const database = databaseDouble({ conflictAtOccurrenceIndex: 2, overlap });
    const policy = policyDouble({ overlap });
    const service = new RecurrenceService(database, clockDouble(), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      status: 409,
      code: "BOOKING_CONFLICT",
      details: {
        occurrenceNumber: 3,
        startAt: "2026-04-05T06:00:00.000Z",
        endAt: "2026-04-05T07:00:00.000Z"
      }
    });
    expect(database.transaction.booking.create).toHaveBeenCalledTimes(3);
  });

  it("does not hide unrelated transaction failures", async () => {
    const failure = new Error("connection closed");
    const database = databaseDouble({
      conflictAtOccurrenceIndex: 1,
      overlap: failure
    });
    const service = new RecurrenceService(
      database,
      clockDouble(),
      policyDouble()
    );

    await expect(service.create(USER_ID, validInput())).rejects.toBe(failure);
  });
});

function validInput() {
  return {
    roomId: ROOM_ID,
    title: "  Щотижнева синхронізація  ",
    startAt: "2026-03-22T07:00:00.000Z",
    endAt: "2026-03-22T08:00:00.000Z",
    occurrenceCount: 3
  };
}

function projection(): KyivWeeklySeriesProjection {
  return {
    firstLocalDate: "2026-03-22",
    firstLocalStartTime: "09:00:00",
    durationMinutes: 60,
    occurrences: [
      {
        occurrenceIndex: 0,
        startAt: "2026-03-22T07:00:00.000Z",
        endAt: "2026-03-22T08:00:00.000Z"
      },
      {
        occurrenceIndex: 1,
        startAt: "2026-03-29T06:00:00.000Z",
        endAt: "2026-03-29T07:00:00.000Z"
      },
      {
        occurrenceIndex: 2,
        startAt: "2026-04-05T06:00:00.000Z",
        endAt: "2026-04-05T07:00:00.000Z"
      }
    ]
  };
}

function clockDouble(): Clock & { now: ReturnType<typeof vi.fn> } {
  return {
    now: vi
      .fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValue(new Date("2099-01-01T00:00:00.000Z"))
  };
}

function policyDouble(options?: {
  validationError?: AppError;
  contextError?: AppError;
  overlap?: unknown;
}) {
  return {
    assertContext:
      options?.contextError === undefined
        ? vi.fn().mockResolvedValue(undefined)
        : vi.fn().mockRejectedValue(options.contextError),
    validateCandidate:
      options?.validationError === undefined
        ? vi.fn(validateCreateBooking)
        : vi.fn(() => {
            throw options.validationError;
          }),
    isActiveOverlapError: vi.fn(
      (error: unknown) =>
        options?.overlap !== undefined && error === options.overlap
    )
  } as unknown as BookingWritePolicyService & {
    assertContext: ReturnType<typeof vi.fn>;
    validateCandidate: ReturnType<typeof vi.fn>;
    isActiveOverlapError: ReturnType<typeof vi.fn>;
  };
}

function databaseDouble(options?: {
  conflictAtOccurrenceIndex?: number;
  overlap?: unknown;
}) {
  const bookingSeries = {
    create: vi.fn().mockResolvedValue({
      id: SERIES_ID,
      roomId: ROOM_ID,
      title: "Щотижнева синхронізація",
      officeTimezone: "Europe/Kyiv",
      occurrenceCount: 3,
      rule: "WEEKLY"
    })
  };
  const booking = {
    create: vi
      .fn()
      .mockImplementation(
        ({
          data
        }: {
          data: { occurrenceIndex: number; startAt: Date; endAt: Date };
        }) => {
          if (data.occurrenceIndex === options?.conflictAtOccurrenceIndex) {
            return Promise.reject(options.overlap);
          }
          return Promise.resolve({
            id: `30000000-0000-4000-8000-${String(data.occurrenceIndex + 1).padStart(12, "0")}`,
            occurrenceIndex: data.occurrenceIndex,
            startAt: data.startAt,
            endAt: data.endAt
          });
        }
      )
  };
  const transaction = { bookingSeries, booking };
  const $transaction = vi.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction)
  );

  return { $transaction, transaction } as unknown as DatabaseService & {
    $transaction: ReturnType<typeof vi.fn>;
    transaction: typeof transaction;
  };
}

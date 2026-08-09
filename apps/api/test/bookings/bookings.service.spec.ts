import { FixedClock } from "@mrb/time";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import { validateCreateBooking } from "../../src/bookings/booking-policy.js";
import type { BookingWritePolicyService } from "../../src/bookings/booking-write-policy.service.js";
import { BookingsService } from "../../src/bookings/bookings.service.js";

const NOW = new Date("2035-01-15T06:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";

describe("BookingsService", () => {
  it("creates and maps a validated one-off booking", async () => {
    const database = databaseDouble();
    const policy = policyDouble();
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(
      service.create(USER_ID, {
        roomId: ROOM_ID,
        title: "  Планування спринту  ",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      })
    ).resolves.toEqual({
      booking: {
        id: "20000000-0000-4000-8000-000000000001",
        roomId: ROOM_ID,
        title: "Планування спринту",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      }
    });

    expect(database.booking.create).toHaveBeenCalledWith({
      data: {
        roomId: ROOM_ID,
        userId: USER_ID,
        title: "Планування спринту",
        startAt: new Date("2035-01-15T07:00:00.000Z"),
        endAt: new Date("2035-01-15T07:30:00.000Z")
      },
      select: {
        id: true,
        roomId: true,
        title: true,
        startAt: true,
        endAt: true
      }
    });
    expect(policy.validateCandidate).toHaveBeenCalledOnce();
    expect(policy.validateCandidate).toHaveBeenCalledWith(
      {
        roomId: ROOM_ID,
        title: "  Планування спринту  ",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      },
      NOW
    );
    expect(policy.assertContext).toHaveBeenCalledOnce();
    expect(policy.assertContext).toHaveBeenCalledWith(USER_ID, ROOM_ID);
    expect(policy.validateCandidate.mock.invocationCallOrder[0]).toBeLessThan(
      policy.assertContext.mock.invocationCallOrder[0]!
    );
  });

  it("returns ROOM_NOT_FOUND before writing when the room does not exist", async () => {
    const database = databaseDouble({ roomExists: false });
    const policy = policyDouble({
      contextError: new AppError(404, "ROOM_NOT_FOUND", "Room not found")
    });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(
      service.create(USER_ID, {
        roomId: ROOM_ID,
        title: "Планування",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "ROOM_NOT_FOUND"
    });
    expect(database.booking.create).not.toHaveBeenCalled();
  });

  it("rejects an unverified owner before room lookup or booking insertion", async () => {
    const database = databaseDouble({ emailVerifiedAt: null });
    const policy = policyDouble({
      contextError: new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Email verification is required"
      )
    });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
      message: "Email verification is required"
    });
    expect(database.room.findUnique).not.toHaveBeenCalled();
    expect(database.booking.create).not.toHaveBeenCalled();
  });

  it("fails loudly when the authenticated booking owner no longer exists", async () => {
    const database = databaseDouble({ ownerExists: false });
    const policy = policyDouble({
      contextError: new Error("Authenticated booking owner no longer exists")
    });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toThrow(
      "Authenticated booking owner no longer exists"
    );
    expect(database.room.findUnique).not.toHaveBeenCalled();
    expect(database.booking.create).not.toHaveBeenCalled();
  });

  it("retries a deadlocked insert once and returns the booking when it wins", async () => {
    const database = databaseDouble();
    database.booking.create = vi
      .fn()
      .mockRejectedValueOnce(deadlockError())
      .mockResolvedValueOnce({
        id: "20000000-0000-4000-8000-000000000001",
        roomId: ROOM_ID,
        title: "Планування спринту",
        startAt: new Date("2035-01-15T07:00:00.000Z"),
        endAt: new Date("2035-01-15T07:30:00.000Z")
      });
    const policy = policyDouble({ retryableWriteConflict: true });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(service.create(USER_ID, validInput())).resolves.toMatchObject({
      booking: { id: "20000000-0000-4000-8000-000000000001" }
    });
    expect(database.booking.create).toHaveBeenCalledTimes(2);
  });

  it("reports BOOKING_CONFLICT when the retry after a deadlock loses the slot", async () => {
    const database = databaseDouble();
    database.booking.create = vi
      .fn()
      .mockRejectedValueOnce(deadlockError())
      .mockRejectedValueOnce(exclusionError());
    const policy = policyDouble({ retryableWriteConflict: true });
    policy.isRetryableWriteConflict = vi
      .fn()
      .mockImplementation((error: unknown) => error === deadlockSentinel);
    policy.isActiveOverlapError = vi
      .fn()
      .mockImplementation((error: unknown) => error !== deadlockSentinel);
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      status: 409,
      code: "BOOKING_CONFLICT"
    });
    expect(database.booking.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a deadlock more than once", async () => {
    const database = databaseDouble();
    database.booking.create = vi.fn().mockRejectedValue(deadlockError());
    const policy = policyDouble({ retryableWriteConflict: true });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(service.create(USER_ID, validInput())).rejects.toBe(
      deadlockSentinel
    );
    expect(database.booking.create).toHaveBeenCalledTimes(2);
  });

  it("maps only the active-booking exclusion constraint to BOOKING_CONFLICT", async () => {
    const database = databaseDouble({
      createError: {
        code: "P2004",
        meta: {
          database_error: {
            code: "23P01",
            constraint: "bookings_no_active_overlap"
          }
        }
      }
    });
    const policy = policyDouble({ activeOverlap: true });
    const service = new BookingsService(database, new FixedClock(NOW), policy);

    await expect(
      service.create(USER_ID, {
        roomId: ROOM_ID,
        title: "Планування",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "BOOKING_CONFLICT",
      fields: {
        startAt: expect.any(Array),
        endAt: expect.any(Array)
      }
    });
  });

  it("does not hide unrelated database failures", async () => {
    const failure = new Error("connection closed");
    const database = databaseDouble({ createError: failure });
    const service = new BookingsService(
      database,
      new FixedClock(NOW),
      policyDouble()
    );

    await expect(
      service.create(USER_ID, {
        roomId: ROOM_ID,
        title: "Планування",
        startAt: "2035-01-15T07:00:00.000Z",
        endAt: "2035-01-15T07:30:00.000Z"
      })
    ).rejects.toBe(failure);
  });

  it("atomically cancels an owned active booking that has not ended", async () => {
    const database = databaseDouble({
      cancellationBooking: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: USER_ID,
        status: "ACTIVE" as const,
        endAt: new Date("2035-01-15T07:30:00.000Z")
      }
    });
    const service = new BookingsService(
      database,
      new FixedClock(NOW),
      policyDouble()
    );

    await expect(
      service.cancel(USER_ID, "20000000-0000-4000-8000-000000000001")
    ).resolves.toEqual({
      booking: {
        id: "20000000-0000-4000-8000-000000000001",
        status: "CANCELLED" as const,
        cancelledAt: "2035-01-15T06:00:00.000Z"
      }
    });

    expect(database.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: USER_ID,
        status: "ACTIVE" as const,
        endAt: { gt: NOW }
      },
      data: {
        status: "CANCELLED",
        cancelledAt: NOW
      }
    });
  });

  it.each([
    {
      name: "a missing booking",
      booking: null,
      expected: { status: 404, code: "BOOKING_NOT_FOUND" }
    },
    {
      name: "another user's booking",
      booking: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: "00000000-0000-4000-8000-000000000099",
        status: "ACTIVE" as const,
        endAt: new Date("2035-01-15T07:30:00.000Z")
      },
      expected: { status: 403, code: "BOOKING_FORBIDDEN" }
    },
    {
      name: "an already cancelled booking",
      booking: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: USER_ID,
        status: "CANCELLED" as const,
        endAt: new Date("2035-01-15T07:30:00.000Z")
      },
      expected: { status: 409, code: "BOOKING_ALREADY_CANCELLED" }
    },
    {
      name: "a completed booking",
      booking: {
        id: "20000000-0000-4000-8000-000000000001",
        userId: USER_ID,
        status: "ACTIVE" as const,
        endAt: NOW
      },
      expected: { status: 409, code: "BOOKING_ALREADY_ENDED" }
    }
  ])(
    "rejects $name with a stable domain error",
    async ({ booking, expected }) => {
      const database = databaseDouble({
        cancellationBooking: booking,
        cancellationUpdated: false
      });
      const service = new BookingsService(
        database,
        new FixedClock(NOW),
        policyDouble()
      );

      await expect(
        service.cancel(USER_ID, "20000000-0000-4000-8000-000000000001")
      ).rejects.toMatchObject(expected);
    }
  );

  it("lists active bookings before upcoming bookings with server-derived states", async () => {
    const database = databaseDouble({
      listedBookings: [
        persistedBooking({
          id: "20000000-0000-4000-8000-000000000010",
          startAt: "2035-01-15T05:30:00.000Z",
          endAt: "2035-01-15T06:30:00.000Z"
        }),
        persistedBooking({
          id: "20000000-0000-4000-8000-000000000011",
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T07:30:00.000Z",
          seriesId: "40000000-0000-4000-8000-000000000001",
          occurrenceIndex: 1,
          occurrenceCount: 3
        })
      ]
    });
    const service = new BookingsService(
      database,
      new FixedClock(NOW),
      policyDouble()
    );

    await expect(
      service.listMine(USER_ID, { section: "upcoming" })
    ).resolves.toEqual({
      bookings: [
        expect.objectContaining({
          id: "20000000-0000-4000-8000-000000000010",
          state: "ACTIVE",
          seriesId: null,
          occurrenceIndex: null,
          occurrenceCount: null
        }),
        expect.objectContaining({
          id: "20000000-0000-4000-8000-000000000011",
          state: "UPCOMING",
          seriesId: "40000000-0000-4000-8000-000000000001",
          occurrenceIndex: 1,
          occurrenceCount: 3
        })
      ],
      nextCursor: null
    });
    expect(database.booking.findMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        status: "ACTIVE",
        endAt: { gt: NOW }
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: expect.objectContaining({
        seriesId: true,
        occurrenceIndex: true,
        series: { select: { occurrenceCount: true } }
      })
    });
  });

  it("returns twenty newest history rows and an opaque continuation cursor", async () => {
    const listedBookings = Array.from({ length: 21 }, (_, index) =>
      persistedBooking({
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        status: index === 0 ? "CANCELLED" : "ACTIVE",
        ...(index === 0 ? { cancelledAt: "2035-01-15T05:00:00.000Z" } : {}),
        startAt: new Date(
          Date.parse("2035-01-15T05:30:00.000Z") - index * 60 * 60 * 1_000
        ).toISOString(),
        endAt: new Date(
          Date.parse("2035-01-15T06:00:00.000Z") - index * 60 * 60 * 1_000
        ).toISOString()
      })
    );
    const database = databaseDouble({ listedBookings });
    const service = new BookingsService(
      database,
      new FixedClock(NOW),
      policyDouble()
    );

    const result = await service.listMine(USER_ID, { section: "history" });

    expect(result.bookings).toHaveLength(20);
    expect(result.bookings[0]).toMatchObject({ state: "CANCELLED" });
    expect(result.bookings[1]).toMatchObject({ state: "COMPLETED" });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(result.nextCursor).not.toContain(
      listedBookings[19]?.startAt.toISOString() ?? ""
    );
    expect(database.booking.findMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        OR: [{ status: "CANCELLED" }, { endAt: { lte: NOW } }]
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: 21,
      select: expect.any(Object)
    });
  });

  it("rejects a malformed history cursor before querying the database", async () => {
    const database = databaseDouble();
    const service = new BookingsService(
      database,
      new FixedClock(NOW),
      policyDouble()
    );

    await expect(
      service.listMine(USER_ID, {
        section: "history",
        cursor: "not-a-valid-cursor"
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CURSOR"
    });
    expect(database.booking.findMany).not.toHaveBeenCalled();
  });
});

function databaseDouble(options?: {
  roomExists?: boolean;
  ownerExists?: boolean;
  emailVerifiedAt?: Date | null;
  createError?: unknown;
  cancellationBooking?: {
    id: string;
    userId: string;
    status: "ACTIVE" | "CANCELLED";
    endAt: Date;
  } | null;
  cancellationUpdated?: boolean;
  listedBookings?: ReturnType<typeof persistedBooking>[];
}) {
  const booking = {
    create:
      options?.createError === undefined
        ? vi.fn().mockResolvedValue({
            id: "20000000-0000-4000-8000-000000000001",
            roomId: ROOM_ID,
            title: "Планування спринту",
            startAt: new Date("2035-01-15T07:00:00.000Z"),
            endAt: new Date("2035-01-15T07:30:00.000Z")
          })
        : vi.fn().mockRejectedValue(options.createError),
    updateMany: vi.fn().mockResolvedValue({
      count: options?.cancellationUpdated === false ? 0 : 1
    }),
    findUnique: vi.fn().mockResolvedValue(options?.cancellationBooking ?? null),
    findMany: vi.fn().mockResolvedValue(options?.listedBookings ?? [])
  };
  const room = {
    findUnique: vi
      .fn()
      .mockResolvedValue(options?.roomExists === false ? null : { id: ROOM_ID })
  };
  const user = {
    findUnique: vi.fn().mockResolvedValue(
      options?.ownerExists === false
        ? null
        : {
            emailVerifiedAt:
              options?.emailVerifiedAt === undefined
                ? NOW
                : options.emailVerifiedAt
          }
    )
  };

  return { booking, room, user } as unknown as DatabaseService & {
    booking: typeof booking;
    room: typeof room;
    user: typeof user;
  };
}

function validInput() {
  return {
    roomId: ROOM_ID,
    title: "Планування",
    startAt: "2035-01-15T07:00:00.000Z",
    endAt: "2035-01-15T07:30:00.000Z"
  };
}

/**
 * Shapes mirror what @prisma/adapter-pg surfaces for a PostgreSQL error: the
 * SQLSTATE lives on meta.driverAdapterError.cause, not on the Prisma code.
 */
const deadlockSentinel = {
  code: "P2039",
  meta: {
    driverAdapterError: {
      cause: { code: "40P01", message: "deadlock detected" }
    }
  }
};

function deadlockError() {
  return deadlockSentinel;
}

function exclusionError() {
  return {
    code: "P2039",
    meta: {
      driverAdapterError: {
        cause: {
          code: "23P01",
          message:
            'conflicting key value violates exclusion constraint "bookings_no_active_overlap"'
        }
      }
    }
  };
}

function policyDouble(options?: {
  contextError?: Error;
  activeOverlap?: boolean;
  retryableWriteConflict?: boolean;
}) {
  return {
    assertContext:
      options?.contextError === undefined
        ? vi.fn().mockResolvedValue(undefined)
        : vi.fn().mockRejectedValue(options.contextError),
    validateCandidate: vi.fn(validateCreateBooking),
    isActiveOverlapError: vi
      .fn()
      .mockReturnValue(options?.activeOverlap ?? false),
    isRetryableWriteConflict: vi
      .fn()
      .mockReturnValue(options?.retryableWriteConflict ?? false)
  } as unknown as BookingWritePolicyService & {
    assertContext: ReturnType<typeof vi.fn>;
    validateCandidate: ReturnType<typeof vi.fn>;
    isActiveOverlapError: ReturnType<typeof vi.fn>;
    isRetryableWriteConflict: ReturnType<typeof vi.fn>;
  };
}

function persistedBooking(options: {
  id: string;
  startAt: string;
  endAt: string;
  status?: "ACTIVE" | "CANCELLED";
  cancelledAt?: string;
  seriesId?: string;
  occurrenceIndex?: number;
  occurrenceCount?: number;
}) {
  return {
    id: options.id,
    title: "Командна зустріч",
    startAt: new Date(options.startAt),
    endAt: new Date(options.endAt),
    status: options.status ?? "ACTIVE",
    cancelledAt:
      options.cancelledAt === undefined ? null : new Date(options.cancelledAt),
    seriesId: options.seriesId ?? null,
    occurrenceIndex: options.occurrenceIndex ?? null,
    series:
      options.occurrenceCount === undefined
        ? null
        : { occurrenceCount: options.occurrenceCount },
    room: {
      id: ROOM_ID,
      name: "Дніпро"
    }
  };
}

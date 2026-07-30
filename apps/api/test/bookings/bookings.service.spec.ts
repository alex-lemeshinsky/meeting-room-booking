import { FixedClock } from "@mrb/time";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../src/database/database.service.js";
import { BookingsService } from "../../src/bookings/bookings.service.js";

const NOW = new Date("2035-01-15T06:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";

describe("BookingsService", () => {
  it("creates and maps a validated one-off booking", async () => {
    const database = databaseDouble();
    const service = new BookingsService(database, new FixedClock(NOW));

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
  });

  it("returns ROOM_NOT_FOUND before writing when the room does not exist", async () => {
    const database = databaseDouble({ roomExists: false });
    const service = new BookingsService(database, new FixedClock(NOW));

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
    const service = new BookingsService(database, new FixedClock(NOW));

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
    const service = new BookingsService(database, new FixedClock(NOW));

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
    const service = new BookingsService(database, new FixedClock(NOW));

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
      const service = new BookingsService(database, new FixedClock(NOW));

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
          endAt: "2035-01-15T07:30:00.000Z"
        })
      ]
    });
    const service = new BookingsService(database, new FixedClock(NOW));

    await expect(
      service.listMine(USER_ID, { section: "upcoming" })
    ).resolves.toEqual({
      bookings: [
        expect.objectContaining({
          id: "20000000-0000-4000-8000-000000000010",
          state: "ACTIVE"
        }),
        expect.objectContaining({
          id: "20000000-0000-4000-8000-000000000011",
          state: "UPCOMING"
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
      select: expect.any(Object)
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
    const service = new BookingsService(database, new FixedClock(NOW));

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
    const service = new BookingsService(database, new FixedClock(NOW));

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

  return { booking, room } as unknown as DatabaseService & {
    booking: typeof booking;
    room: typeof room;
  };
}

function persistedBooking(options: {
  id: string;
  startAt: string;
  endAt: string;
  status?: "ACTIVE" | "CANCELLED";
  cancelledAt?: string;
}) {
  return {
    id: options.id,
    title: "Командна зустріч",
    startAt: new Date(options.startAt),
    endAt: new Date(options.endAt),
    status: options.status ?? "ACTIVE",
    cancelledAt:
      options.cancelledAt === undefined ? null : new Date(options.cancelledAt),
    room: {
      id: ROOM_ID,
      name: "Дніпро"
    }
  };
}

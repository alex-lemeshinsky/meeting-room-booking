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
});

function databaseDouble(options?: {
  roomExists?: boolean;
  createError?: unknown;
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
        : vi.fn().mockRejectedValue(options.createError)
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

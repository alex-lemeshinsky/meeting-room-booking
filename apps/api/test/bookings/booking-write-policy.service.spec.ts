import { describe, expect, it, vi } from "vitest";
import { BookingWritePolicyService } from "../../src/bookings/booking-write-policy.service.js";
import type { DatabaseService } from "../../src/database/database.service.js";

const NOW = new Date("2035-01-15T06:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const UNVERIFIED_USER_ID = "00000000-0000-4000-8000-000000000002";
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const MISSING_ROOM_ID = "10000000-0000-4000-8000-000000000099";

describe("BookingWritePolicyService", () => {
  it("accepts a verified owner and an existing room", async () => {
    const policy = new BookingWritePolicyService(databaseDouble());

    await expect(
      policy.assertContext(USER_ID, ROOM_ID)
    ).resolves.toBeUndefined();
  });

  it("rejects an unverified owner before looking up the room", async () => {
    const database = databaseDouble();
    const policy = new BookingWritePolicyService(database);

    await expect(
      policy.assertContext(UNVERIFIED_USER_ID, ROOM_ID)
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(database.room.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing room after validating the owner", async () => {
    const policy = new BookingWritePolicyService(databaseDouble());

    await expect(
      policy.assertContext(USER_ID, MISSING_ROOM_ID)
    ).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("fails loudly when the authenticated owner no longer exists", async () => {
    const policy = new BookingWritePolicyService(databaseDouble());

    await expect(
      policy.assertContext("00000000-0000-4000-8000-000000000099", ROOM_ID)
    ).rejects.toThrow("Authenticated booking owner no longer exists");
  });

  it("validates and normalizes a booking candidate", () => {
    const policy = new BookingWritePolicyService(databaseDouble());

    expect(
      policy.validateCandidate(
        {
          title: "  Планування спринту  ",
          startAt: "2035-01-15T07:00:00.000Z",
          endAt: "2035-01-15T07:30:00.000Z"
        },
        NOW
      )
    ).toEqual({
      title: "Планування спринту",
      startAt: new Date("2035-01-15T07:00:00.000Z"),
      endAt: new Date("2035-01-15T07:30:00.000Z")
    });
  });

  it("recognizes only the active-booking exclusion constraint", () => {
    const policy = new BookingWritePolicyService(databaseDouble());

    expect(
      policy.isActiveOverlapError({
        code: "P2004",
        meta: {
          database_error: {
            code: "23P01",
            constraint: "bookings_no_active_overlap"
          }
        }
      })
    ).toBe(true);
    expect(
      policy.isActiveOverlapError({
        code: "P2004",
        meta: { constraint: "another_constraint" }
      })
    ).toBe(false);
  });
});

function databaseDouble() {
  const user = {
    findUnique: vi
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === UNVERIFIED_USER_ID) {
          return Promise.resolve({ emailVerifiedAt: null });
        }
        if (where.id === USER_ID) {
          return Promise.resolve({ emailVerifiedAt: NOW });
        }
        return Promise.resolve(null);
      })
  };
  const room = {
    findUnique: vi
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === ROOM_ID ? { id: ROOM_ID } : null)
      )
  };

  return { user, room } as unknown as DatabaseService & {
    user: typeof user;
    room: typeof room;
  };
}

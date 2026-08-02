import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreateBookingPolicyInput } from "./booking-policy.js";
import { BookingWritePolicyService } from "./booking-write-policy.service.js";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  mapMyBooking,
  type MyBooking,
  type MyBookingsSection
} from "./my-bookings.js";

export interface CreateBookingInput extends CreateBookingPolicyInput {
  roomId: string;
}

export interface CreateBookingResponse {
  booking: {
    id: string;
    roomId: string;
    title: string;
    startAt: string;
    endAt: string;
  };
}

export interface CancelBookingResponse {
  booking: {
    id: string;
    status: "CANCELLED";
    cancelledAt: string;
  };
}

export interface ListMyBookingsInput {
  section: MyBookingsSection;
  cursor?: string;
}

export interface ListMyBookingsResponse {
  bookings: MyBooking[];
  nextCursor: string | null;
}

const HISTORY_PAGE_SIZE = 20;
const MY_BOOKING_SELECT = {
  id: true,
  title: true,
  startAt: true,
  endAt: true,
  status: true,
  cancelledAt: true,
  room: {
    select: {
      id: true,
      name: true
    }
  }
} as const;

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(BookingWritePolicyService)
    private readonly writePolicy: BookingWritePolicyService
  ) {}

  async create(
    userId: string,
    input: CreateBookingInput
  ): Promise<CreateBookingResponse> {
    const booking = this.writePolicy.validateCandidate(input, this.clock.now());
    await this.writePolicy.assertContext(userId, input.roomId);

    try {
      const created = await this.database.booking.create({
        data: {
          roomId: input.roomId,
          userId,
          title: booking.title,
          startAt: booking.startAt,
          endAt: booking.endAt
        },
        select: {
          id: true,
          roomId: true,
          title: true,
          startAt: true,
          endAt: true
        }
      });

      return {
        booking: {
          id: created.id,
          roomId: created.roomId,
          title: created.title,
          startAt: created.startAt.toISOString(),
          endAt: created.endAt.toISOString()
        }
      };
    } catch (error) {
      if (this.writePolicy.isActiveOverlapError(error)) {
        throw new AppError(
          409,
          "BOOKING_CONFLICT",
          "This time is already booked",
          {
            startAt: ["Choose another interval"],
            endAt: ["Choose another interval"]
          }
        );
      }
      throw error;
    }
  }

  async cancel(
    userId: string,
    bookingId: string
  ): Promise<CancelBookingResponse> {
    const now = this.clock.now();
    const result = await this.database.booking.updateMany({
      where: {
        id: bookingId,
        userId,
        status: "ACTIVE",
        endAt: { gt: now }
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now
      }
    });

    if (result.count === 1) {
      return {
        booking: {
          id: bookingId,
          status: "CANCELLED",
          cancelledAt: now.toISOString()
        }
      };
    }

    const booking = await this.database.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, status: true, endAt: true }
    });
    if (booking === null) {
      throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
    }
    if (booking.userId !== userId) {
      throw new AppError(
        403,
        "BOOKING_FORBIDDEN",
        "Only the booking owner can cancel it"
      );
    }
    if (booking.status === "CANCELLED") {
      throw new AppError(
        409,
        "BOOKING_ALREADY_CANCELLED",
        "Booking is already cancelled"
      );
    }

    throw new AppError(
      409,
      "BOOKING_ALREADY_ENDED",
      "Completed bookings cannot be cancelled"
    );
  }

  async listMine(
    userId: string,
    input: ListMyBookingsInput
  ): Promise<ListMyBookingsResponse> {
    const now = this.clock.now();
    if (input.section === "upcoming") {
      if (input.cursor !== undefined) {
        throw invalidHistoryCursor();
      }

      const bookings = await this.database.booking.findMany({
        where: {
          userId,
          status: "ACTIVE",
          endAt: { gt: now }
        },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        select: MY_BOOKING_SELECT
      });

      return {
        bookings: bookings.map((booking) => mapMyBooking(booking, now)),
        nextCursor: null
      };
    }

    const cursor =
      input.cursor === undefined
        ? undefined
        : decodeHistoryCursor(input.cursor);
    const bookings = await this.database.booking.findMany({
      where: {
        userId,
        OR: [{ status: "CANCELLED" }, { endAt: { lte: now } }],
        ...(cursor === undefined
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { startAt: { lt: new Date(cursor.startAt) } },
                    {
                      startAt: new Date(cursor.startAt),
                      id: { lt: cursor.id }
                    }
                  ]
                }
              ]
            })
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: HISTORY_PAGE_SIZE + 1,
      select: MY_BOOKING_SELECT
    });
    const page = bookings.slice(0, HISTORY_PAGE_SIZE);

    return {
      bookings: page.map((booking) => mapMyBooking(booking, now)),
      nextCursor:
        bookings.length > HISTORY_PAGE_SIZE && page.at(-1) !== undefined
          ? encodeHistoryCursor(page.at(-1)!)
          : null
    };
  }
}

function invalidHistoryCursor(): AppError {
  return new AppError(400, "INVALID_CURSOR", "History cursor is invalid", {
    cursor: ["Cursor pagination is available only for history"]
  });
}

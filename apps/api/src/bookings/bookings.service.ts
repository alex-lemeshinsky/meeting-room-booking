import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import {
  validateCreateBooking,
  type CreateBookingPolicyInput
} from "./booking-policy.js";

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

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  async create(
    userId: string,
    input: CreateBookingInput
  ): Promise<CreateBookingResponse> {
    const booking = validateCreateBooking(input, this.clock.now());
    const room = await this.database.room.findUnique({
      where: { id: input.roomId },
      select: { id: true }
    });
    if (room === null) {
      throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
    }

    // TODO(Stage 7): reject unverified users here with EMAIL_NOT_VERIFIED.
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
      if (isActiveBookingExclusionError(error)) {
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
}

function isActiveBookingExclusionError(error: unknown): boolean {
  return (
    (hasNestedValue(error, "P2004") || hasNestedValue(error, "23P01")) &&
    hasNestedText(error, "bookings_no_active_overlap")
  );
}

function hasNestedValue(value: unknown, expected: string): boolean {
  const visited = new Set<unknown>();

  function visit(candidate: unknown): boolean {
    if (candidate === expected) return true;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      visited.has(candidate)
    ) {
      return false;
    }

    visited.add(candidate);
    return Object.values(candidate).some(visit);
  }

  return visit(value);
}

function hasNestedText(value: unknown, expected: string): boolean {
  const visited = new Set<unknown>();

  function visit(candidate: unknown): boolean {
    if (typeof candidate === "string") return candidate.includes(expected);
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      visited.has(candidate)
    ) {
      return false;
    }

    visited.add(candidate);
    return Object.values(candidate).some(visit);
  }

  return visit(value);
}

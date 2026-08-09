import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import {
  validateCreateBooking,
  type CreateBookingPolicyInput,
  type ValidatedBooking
} from "./booking-policy.js";

@Injectable()
export class BookingWritePolicyService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async assertContext(userId: string, roomId: string): Promise<void> {
    const owner = await this.database.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true }
    });
    if (owner === null) {
      throw new Error("Authenticated booking owner no longer exists");
    }
    if (owner.emailVerifiedAt === null) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Email verification is required"
      );
    }

    const room = await this.database.room.findUnique({
      where: { id: roomId },
      select: { id: true }
    });
    if (room === null) {
      throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
    }
  }

  validateCandidate(
    input: CreateBookingPolicyInput,
    now: Date
  ): ValidatedBooking {
    return validateCreateBooking(input, now);
  }

  isActiveOverlapError(error: unknown): boolean {
    return (
      (hasNestedValue(error, "P2004") || hasNestedValue(error, "23P01")) &&
      hasNestedText(error, "bookings_no_active_overlap")
    );
  }

  /**
   * Two concurrent inserts for the same slot can deadlock inside the GiST
   * exclusion index instead of one cleanly violating it: each waits on the
   * other's transaction, and PostgreSQL aborts one with `40P01`. The victim's
   * transaction is rolled back without deciding whether the slot was taken, so
   * this is a retryable outcome rather than a conflict.
   */
  isRetryableWriteConflict(error: unknown): boolean {
    return hasNestedValue(error, "40P01") || hasNestedValue(error, "40001");
  }
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

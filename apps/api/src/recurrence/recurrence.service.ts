import { buildKyivWeeklySeries, CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import type { ValidatedBooking } from "../bookings/booking-policy.js";
import { BookingWritePolicyService } from "../bookings/booking-write-policy.service.js";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";

const OFFICE_TIMEZONE = "Europe/Kyiv" as const;
const RECURRENCE_RULE = "WEEKLY" as const;

export interface CreateBookingSeriesInput {
  roomId: string;
  title: string;
  startAt: string;
  endAt: string;
  occurrenceCount: number;
}

export interface CreateBookingSeriesResponse {
  series: {
    id: string;
    roomId: string;
    title: string;
    officeTimezone: typeof OFFICE_TIMEZONE;
    occurrenceCount: number;
    rule: typeof RECURRENCE_RULE;
  };
  occurrences: Array<{
    id: string;
    occurrenceIndex: number;
    startAt: string;
    endAt: string;
  }>;
}

interface ValidatedOccurrence extends ValidatedBooking {
  occurrenceIndex: number;
}

@Injectable()
export class RecurrenceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(BookingWritePolicyService)
    private readonly policy: BookingWritePolicyService
  ) {}

  async create(
    userId: string,
    input: CreateBookingSeriesInput
  ): Promise<CreateBookingSeriesResponse> {
    const now = this.clock.now();
    const firstBooking = this.policy.validateCandidate(input, now);
    await this.policy.assertContext(userId, input.roomId);

    let projection;
    try {
      projection = buildKyivWeeklySeries(
        input.startAt,
        input.endAt,
        input.occurrenceCount
      );
    } catch (error) {
      if (error instanceof RangeError) {
        throw new AppError(
          400,
          "INVALID_RECURRENCE_OCCURRENCE",
          "A recurring occurrence is invalid"
        );
      }
      throw error;
    }

    const validatedOccurrences: ValidatedOccurrence[] =
      projection.occurrences.map((occurrence) => ({
        occurrenceIndex: occurrence.occurrenceIndex,
        ...this.policy.validateCandidate(
          {
            title: firstBooking.title,
            startAt: occurrence.startAt,
            endAt: occurrence.endAt
          },
          now
        )
      }));

    return this.database.$transaction(async (transaction) => {
      const series = await transaction.bookingSeries.create({
        data: {
          userId,
          roomId: input.roomId,
          title: firstBooking.title,
          officeTimezone: OFFICE_TIMEZONE,
          firstLocalDate: new Date(
            `${projection.firstLocalDate}T00:00:00.000Z`
          ),
          firstLocalStartTime: new Date(
            `1970-01-01T${projection.firstLocalStartTime}.000Z`
          ),
          durationMinutes: projection.durationMinutes,
          occurrenceCount: input.occurrenceCount,
          rule: RECURRENCE_RULE
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
      const occurrences = [];

      for (const candidate of validatedOccurrences) {
        try {
          const occurrence = await transaction.booking.create({
            data: {
              roomId: input.roomId,
              userId,
              seriesId: series.id,
              occurrenceIndex: candidate.occurrenceIndex,
              title: candidate.title,
              startAt: candidate.startAt,
              endAt: candidate.endAt
            },
            select: {
              id: true,
              occurrenceIndex: true,
              startAt: true,
              endAt: true
            }
          });
          occurrences.push({
            id: occurrence.id,
            occurrenceIndex: candidate.occurrenceIndex,
            startAt: occurrence.startAt.toISOString(),
            endAt: occurrence.endAt.toISOString()
          });
        } catch (error) {
          if (this.policy.isActiveOverlapError(error)) {
            throw recurrenceConflict(candidate);
          }
          throw error;
        }
      }

      return {
        series: {
          id: series.id,
          roomId: series.roomId,
          title: series.title,
          officeTimezone: OFFICE_TIMEZONE,
          occurrenceCount: series.occurrenceCount,
          rule: RECURRENCE_RULE
        },
        occurrences
      };
    });
  }
}

function recurrenceConflict(candidate: ValidatedOccurrence): AppError {
  return new AppError(
    409,
    "BOOKING_CONFLICT",
    "This time is already booked",
    {
      startAt: ["Choose another interval"],
      endAt: ["Choose another interval"]
    },
    {
      occurrenceNumber: candidate.occurrenceIndex + 1,
      startAt: candidate.startAt.toISOString(),
      endAt: candidate.endAt.toISOString()
    }
  );
}

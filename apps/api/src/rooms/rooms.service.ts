import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import type { RoomDto } from "./room.dto.js";
import type { ScheduleResponseDto } from "./schedule.dto.js";

const MAX_SCHEDULE_SPAN_MS = 8 * 24 * 60 * 60 * 1_000;

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(minCapacity?: number): Promise<RoomDto[]> {
    return this.database.room.findMany({
      ...(minCapacity === undefined
        ? {}
        : { where: { capacity: { gte: minCapacity } } }),
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      select: { id: true, name: true, floor: true, capacity: true }
    });
  }

  async schedule(
    roomId: string,
    from: string,
    to: string,
    userId: string
  ): Promise<ScheduleResponseDto> {
    const fromAt = new Date(from);
    const toAt = new Date(to);
    const span = toAt.getTime() - fromAt.getTime();

    if (span <= 0) {
      throw new AppError(
        400,
        "INVALID_SCHEDULE_RANGE",
        "Schedule range is invalid",
        {
          from: ["from must be before to"],
          to: ["to must be after from"]
        }
      );
    }

    if (span > MAX_SCHEDULE_SPAN_MS) {
      throw new AppError(
        400,
        "INVALID_SCHEDULE_RANGE",
        "Schedule range is invalid",
        { to: ["Schedule range must not exceed 8 days"] }
      );
    }

    const room = await this.database.room.findUnique({
      where: { id: roomId },
      select: { id: true, name: true, floor: true, capacity: true }
    });
    if (!room) {
      throw new AppError(404, "ROOM_NOT_FOUND", "Room not found");
    }

    const bookings = await this.database.booking.findMany({
      where: {
        roomId,
        status: "ACTIVE",
        startAt: { lt: toAt },
        endAt: { gt: fromAt }
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        seriesId: true,
        occurrenceIndex: true,
        series: { select: { occurrenceCount: true } },
        user: { select: { id: true, name: true } }
      }
    });

    return {
      room,
      from: fromAt.toISOString(),
      to: toAt.toISOString(),
      bookings: bookings.map((booking) => ({
        id: booking.id,
        title: booking.title,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        organizer: booking.user,
        isOwn: booking.user.id === userId,
        seriesId: booking.seriesId,
        occurrenceIndex: booking.occurrenceIndex,
        occurrenceCount: booking.series?.occurrenceCount ?? null
      }))
    };
  }
}

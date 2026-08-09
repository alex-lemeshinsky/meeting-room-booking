import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import type { MarkReadResponseDto } from "./dto/mark-read-response.dto.js";
import type { NotificationsResponseDto } from "./dto/notifications-response.dto.js";

/**
 * The scheduler only creates a notification while both bookings are active,
 * but either one can still be cancelled during the notify-before window. The
 * specification requires the notification not to stand in that case, so
 * cancelled pairs are withheld at read time rather than deleted, keeping the
 * row for history and closing the gap for notifications already persisted.
 */
function liveNotificationsFor(userId: string) {
  return {
    userId,
    currentBooking: { status: "ACTIVE" },
    nextBooking: { status: "ACTIVE" }
  } as const;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  async listForUser(userId: string): Promise<NotificationsResponseDto> {
    const notifications = await this.database.notification.findMany({
      where: liveNotificationsFor(userId),
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const unreadCount = await this.database.notification.count({
      where: {
        ...liveNotificationsFor(userId),
        readAt: null
      }
    });

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        roomName: n.roomName,
        currentBookingId: n.currentBookingId,
        nextBookingId: n.nextBookingId,
        scheduledFor: n.scheduledFor.toISOString(),
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null
      })),
      unreadCount
    };
  }

  async markAsRead(
    userId: string,
    notificationId: string
  ): Promise<MarkReadResponseDto> {
    const notification = await this.database.notification.findFirst({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      throw new AppError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found"
      );
    }

    if (notification.readAt) {
      return {
        notification: {
          id: notification.id,
          readAt: notification.readAt.toISOString()
        }
      };
    }

    const now = this.clock.now();
    const updated = await this.database.notification.update({
      where: { id: notificationId },
      data: { readAt: now }
    });

    return {
      notification: {
        id: updated.id,
        readAt: updated.readAt!.toISOString()
      }
    };
  }
}

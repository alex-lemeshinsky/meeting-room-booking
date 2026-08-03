import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import type { MarkReadResponseDto } from "./dto/mark-read-response.dto.js";
import type { NotificationsResponseDto } from "./dto/notifications-response.dto.js";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  async listForUser(userId: string): Promise<NotificationsResponseDto> {
    const notifications = await this.database.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const unreadCount = await this.database.notification.count({
      where: {
        userId,
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

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BookingsModule } from "../bookings/bookings.module.js";
import {
  notificationListenerClientFactory,
  NotificationEventRelay,
  NOTIFICATION_LISTENER_CLIENT_FACTORY
} from "./notification-event-relay.service.js";
import {
  NOTIFICATION_EVENT_PUBLISHER,
  NotificationSchedulerService
} from "./notification-scheduler.service.js";
import { NotificationSseController } from "./notification-sse.controller.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [NotificationsController, NotificationSseController],
  providers: [
    NotificationsService,
    NotificationSchedulerService,
    NotificationEventRelay,
    {
      provide: NOTIFICATION_EVENT_PUBLISHER,
      useExisting: NotificationEventRelay
    },
    {
      provide: NOTIFICATION_LISTENER_CLIENT_FACTORY,
      useValue: notificationListenerClientFactory
    }
  ],
  exports: [NotificationsService]
})
export class NotificationsModule {}

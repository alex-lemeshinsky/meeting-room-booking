import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BookingsModule } from "../bookings/bookings.module.js";
import { NotificationSchedulerService } from "./notification-scheduler.service.js";
import { NotificationSseController } from "./notification-sse.controller.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [NotificationsController, NotificationSseController],
  providers: [NotificationsService, NotificationSchedulerService],
  exports: [NotificationsService]
})
export class NotificationsModule {}

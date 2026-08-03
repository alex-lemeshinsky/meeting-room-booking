import { Module } from "@nestjs/common";
import { NotificationSchedulerService } from "./notification-scheduler.service.js";

@Module({
  providers: [NotificationSchedulerService],
  exports: [NotificationSchedulerService]
})
export class NotificationsModule {}

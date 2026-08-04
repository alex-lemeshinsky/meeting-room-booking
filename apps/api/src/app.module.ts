import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module.js";
import { BookingsController } from "./bookings/bookings.controller.js";
import { BookingsModule } from "./bookings/bookings.module.js";
import { MyBookingsController } from "./bookings/my-bookings.controller.js";
import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { RecurrenceModule } from "./recurrence/recurrence.module.js";
import { RoomsController } from "./rooms/rooms.controller.js";
import { RoomsModule } from "./rooms/rooms.module.js";
import { UsersController } from "./users/users.controller.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  controllers: [
    BookingsController,
    MyBookingsController,
    RoomsController,
    UsersController
  ],
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(process.cwd(), "../../.env"),
      isGlobal: true
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    CommonModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    BookingsModule,
    RecurrenceModule,
    RoomsModule,
    UsersModule,
    NotificationsModule
  ]
})
export class AppModule {}

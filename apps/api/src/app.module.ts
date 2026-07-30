import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module.js";
import { BookingsController } from "./bookings/bookings.controller.js";
import { BookingsModule } from "./bookings/bookings.module.js";
import { MyBookingsController } from "./bookings/my-bookings.controller.js";
import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { RoomsController } from "./rooms/rooms.controller.js";
import { RoomsModule } from "./rooms/rooms.module.js";

@Module({
  controllers: [BookingsController, MyBookingsController, RoomsController],
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(process.cwd(), "../../.env"),
      isGlobal: true
    }),
    CommonModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    BookingsModule,
    RoomsModule
  ]
})
export class AppModule {}

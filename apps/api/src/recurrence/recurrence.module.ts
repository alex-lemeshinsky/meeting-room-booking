import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BookingsModule } from "../bookings/bookings.module.js";
import { RecurrenceController } from "./recurrence.controller.js";
import { RecurrenceService } from "./recurrence.service.js";

@Module({
  controllers: [RecurrenceController],
  imports: [AuthModule, BookingsModule],
  providers: [RecurrenceService]
})
export class RecurrenceModule {}

import { Module } from "@nestjs/common";
import { BookingWritePolicyService } from "./booking-write-policy.service.js";
import { BookingsService } from "./bookings.service.js";

@Module({
  exports: [BookingsService, BookingWritePolicyService],
  providers: [BookingsService, BookingWritePolicyService]
})
export class BookingsModule {}

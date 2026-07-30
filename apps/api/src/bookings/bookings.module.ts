import { Module } from "@nestjs/common";
import { BookingsService } from "./bookings.service.js";

@Module({
  exports: [BookingsService],
  providers: [BookingsService]
})
export class BookingsModule {}

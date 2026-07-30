import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import type { MyBookingState, MyBookingsSection } from "../my-bookings.js";

const MY_BOOKINGS_SECTIONS = ["upcoming", "history"] as const;
const MY_BOOKING_STATES = [
  "ACTIVE",
  "UPCOMING",
  "COMPLETED",
  "CANCELLED"
] as const;

export class MyBookingsQueryDto {
  @ApiProperty({ type: String, enum: MY_BOOKINGS_SECTIONS })
  @IsIn(MY_BOOKINGS_SECTIONS)
  section!: MyBookingsSection;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class MyBookingRoomDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, example: "Дніпро" })
  name!: string;
}

export class MyBookingDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: () => MyBookingRoomDto })
  room!: MyBookingRoomDto;

  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  title!: string;

  @ApiProperty({ type: String, format: "date-time" })
  startAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  endAt!: string;

  @ApiProperty({ type: String, enum: MY_BOOKING_STATES })
  state!: MyBookingState;
}

export class MyBookingsResponseDto {
  @ApiProperty({ type: () => MyBookingDto, isArray: true })
  bookings!: MyBookingDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

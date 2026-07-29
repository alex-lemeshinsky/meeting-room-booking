import { ApiProperty } from "@nestjs/swagger";
import { RoomDto } from "./room.dto.js";

export class ScheduleOrganizerDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, example: "Олена" })
  name!: string;
}

export class ScheduleBookingDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, example: "Планування спринту" })
  title!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-02T10:00:00.000Z"
  })
  startAt!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-02T11:00:00.000Z"
  })
  endAt!: string;

  @ApiProperty({ type: () => ScheduleOrganizerDto })
  organizer!: ScheduleOrganizerDto;

  @ApiProperty({ type: Boolean, example: true })
  isOwn!: boolean;
}

export class ScheduleResponseDto {
  @ApiProperty({ type: () => RoomDto })
  room!: RoomDto;

  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-01T00:00:00.000Z"
  })
  from!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-08T00:00:00.000Z"
  })
  to!: string;

  @ApiProperty({ type: () => ScheduleBookingDto, isArray: true })
  bookings!: ScheduleBookingDto[];
}

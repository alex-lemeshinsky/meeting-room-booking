import { ApiProperty } from "@nestjs/swagger";
import {
  IsISO8601,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min
} from "class-validator";
import { UTC_INSTANT_PATTERN_SOURCE } from "../../rooms/schedule-query.dto.js";

const UTC_INSTANT_MESSAGE =
  "must be a valid ISO 8601 instant ending in uppercase Z with at most 3 fractional digits";
const UTC_INSTANT_PATTERN = new RegExp(UTC_INSTANT_PATTERN_SOURCE);

export class CreateBookingSeriesDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID("4")
  roomId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  title!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: UTC_INSTANT_PATTERN_SOURCE,
    example: "2035-01-15T07:00:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `startAt ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(UTC_INSTANT_PATTERN, {
    message: `startAt ${UTC_INSTANT_MESSAGE}`
  })
  startAt!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: UTC_INSTANT_PATTERN_SOURCE,
    example: "2035-01-15T07:30:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `endAt ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(UTC_INSTANT_PATTERN, { message: `endAt ${UTC_INSTANT_MESSAGE}` })
  endAt!: string;

  @ApiProperty({ type: "integer", minimum: 2, maximum: 52 })
  @IsInt()
  @Min(2)
  @Max(52)
  occurrenceCount!: number;
}

export class CreatedBookingSeriesDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  roomId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  title!: string;

  @ApiProperty({ type: String, enum: ["Europe/Kyiv"] })
  officeTimezone!: "Europe/Kyiv";

  @ApiProperty({ type: "integer", minimum: 2, maximum: 52 })
  occurrenceCount!: number;

  @ApiProperty({ type: String, enum: ["WEEKLY"] })
  rule!: "WEEKLY";
}

export class CreatedSeriesOccurrenceDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: "integer", minimum: 0 })
  occurrenceIndex!: number;

  @ApiProperty({ type: String, format: "date-time" })
  startAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  endAt!: string;
}

export class CreateBookingSeriesResponseDto {
  @ApiProperty({ type: () => CreatedBookingSeriesDto })
  series!: CreatedBookingSeriesDto;

  @ApiProperty({ type: () => [CreatedSeriesOccurrenceDto] })
  occurrences!: CreatedSeriesOccurrenceDto[];
}

export class RecurrenceConflictDetailsDto {
  @ApiProperty({ type: "integer", minimum: 1 })
  occurrenceNumber!: number;

  @ApiProperty({ type: String, format: "date-time" })
  startAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  endAt!: string;
}

export class BookingSeriesConflictErrorDetailsDto {
  @ApiProperty({ type: String, example: "BOOKING_CONFLICT" })
  code!: string;

  @ApiProperty({ type: String, example: "This time is already booked" })
  message!: string;

  @ApiProperty({
    additionalProperties: { type: "array", items: { type: "string" } },
    required: false,
    type: Object
  })
  fields?: Record<string, string[]>;

  @ApiProperty({ type: () => RecurrenceConflictDetailsDto })
  details!: RecurrenceConflictDetailsDto;

  @ApiProperty({
    type: String,
    example: "b6a3a1f7-07d8-4fd8-a0c5-ff1f5aa9b568"
  })
  requestId!: string;
}

export class BookingSeriesConflictErrorDto {
  @ApiProperty({ type: () => BookingSeriesConflictErrorDetailsDto })
  error!: BookingSeriesConflictErrorDetailsDto;
}

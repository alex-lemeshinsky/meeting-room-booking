import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsString, IsUUID, Matches } from "class-validator";
import { UTC_INSTANT_PATTERN_SOURCE } from "../../rooms/schedule-query.dto.js";

const UTC_INSTANT_MESSAGE =
  "must be a valid ISO 8601 instant ending in uppercase Z with at most 3 fractional digits";
const UTC_INSTANT_PATTERN = new RegExp(UTC_INSTANT_PATTERN_SOURCE);

export class CreateBookingDto {
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
}

export class CreatedBookingDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  roomId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  title!: string;

  @ApiProperty({ type: String, format: "date-time" })
  startAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  endAt!: string;
}

export class CreateBookingResponseDto {
  @ApiProperty({ type: () => CreatedBookingDto })
  booking!: CreatedBookingDto;
}

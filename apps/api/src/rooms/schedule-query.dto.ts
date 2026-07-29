import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsUUID, Matches } from "class-validator";

const UTC_INSTANT_MESSAGE =
  "must be a valid ISO 8601 instant ending in uppercase Z with at most 3 fractional digits";
export const UTC_INSTANT_PATTERN_SOURCE =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$";
const UTC_INSTANT_PATTERN = new RegExp(UTC_INSTANT_PATTERN_SOURCE);

export class ScheduleParamsDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID("4")
  roomId!: string;
}

export class ScheduleQueryDto {
  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: UTC_INSTANT_PATTERN_SOURCE,
    example: "2035-01-01T00:00:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `from ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(UTC_INSTANT_PATTERN, { message: `from ${UTC_INSTANT_MESSAGE}` })
  from!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    pattern: UTC_INSTANT_PATTERN_SOURCE,
    example: "2035-01-08T00:00:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `to ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(UTC_INSTANT_PATTERN, { message: `to ${UTC_INSTANT_MESSAGE}` })
  to!: string;
}

import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsUUID, Matches } from "class-validator";

const UTC_INSTANT_MESSAGE =
  "must be a valid ISO 8601 instant ending in uppercase Z";

export class ScheduleParamsDto {
  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID("4")
  roomId!: string;
}

export class ScheduleQueryDto {
  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-01T00:00:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `from ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(/Z$/, { message: `from ${UTC_INSTANT_MESSAGE}` })
  from!: string;

  @ApiProperty({
    type: String,
    format: "date-time",
    example: "2035-01-08T00:00:00.000Z"
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: `to ${UTC_INSTANT_MESSAGE}` }
  )
  @Matches(/Z$/, { message: `to ${UTC_INSTANT_MESSAGE}` })
  to!: string;
}

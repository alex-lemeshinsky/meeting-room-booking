import { ApiProperty } from "@nestjs/swagger";

export class CancelledBookingSeriesDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, enum: ["CANCELLED"] })
  status!: "CANCELLED";

  @ApiProperty({ type: String, format: "date-time" })
  cancelledAt!: string;

  @ApiProperty({ type: "integer", minimum: 1 })
  cancelledCount!: number;
}

export class CancelBookingSeriesResponseDto {
  @ApiProperty({ type: () => CancelledBookingSeriesDto })
  series!: CancelledBookingSeriesDto;
}

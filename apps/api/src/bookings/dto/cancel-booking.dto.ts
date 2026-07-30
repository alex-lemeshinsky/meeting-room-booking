import { ApiProperty } from "@nestjs/swagger";

export class CancelledBookingDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, enum: ["CANCELLED"] })
  status!: "CANCELLED";

  @ApiProperty({ type: String, format: "date-time" })
  cancelledAt!: string;
}

export class CancelBookingResponseDto {
  @ApiProperty({ type: () => CancelledBookingDto })
  booking!: CancelledBookingDto;
}

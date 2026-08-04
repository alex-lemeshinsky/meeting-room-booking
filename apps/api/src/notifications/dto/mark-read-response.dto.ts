import { ApiProperty } from "@nestjs/swagger";

export class NotificationReadSummaryDto {
  @ApiProperty({
    type: String,
    example: "123e4567-e89b-12d3-a456-426614174000"
  })
  id!: string;

  @ApiProperty({ type: String, example: "2026-08-03T10:55:00.000Z" })
  readAt!: string;
}

export class MarkReadResponseDto {
  @ApiProperty({ type: () => NotificationReadSummaryDto })
  notification!: NotificationReadSummaryDto;
}

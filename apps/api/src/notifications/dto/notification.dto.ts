import { ApiProperty } from "@nestjs/swagger";

export class NotificationItemDto {
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  id!: string;

  @ApiProperty({ example: "NEXT_BOOKING_STARTS" })
  type!: string;

  @ApiProperty({
    example:
      "«Стендап» у Берлін завершується за 10 хв — наступне бронювання починається одразу"
  })
  message!: string;

  @ApiProperty({ example: "Берлін" })
  roomName!: string;

  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174001" })
  currentBookingId!: string;

  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174002" })
  nextBookingId!: string;

  @ApiProperty({ example: "2026-08-03T10:50:00.000Z" })
  scheduledFor!: string;

  @ApiProperty({ example: "2026-08-03T10:50:01.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-08-03T10:55:00.000Z", nullable: true })
  readAt!: string | null;
}

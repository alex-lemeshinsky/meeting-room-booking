import { ApiProperty } from "@nestjs/swagger";

export class NotificationItemDto {
  @ApiProperty({
    type: String,
    example: "123e4567-e89b-12d3-a456-426614174000"
  })
  id!: string;

  @ApiProperty({ type: String, example: "NEXT_BOOKING_STARTS" })
  type!: string;

  @ApiProperty({
    type: String,
    example:
      "«Стендап» у Берлін завершується за 10 хв — наступне бронювання починається одразу"
  })
  message!: string;

  @ApiProperty({ type: String, example: "Берлін" })
  roomName!: string;

  @ApiProperty({
    type: String,
    example: "123e4567-e89b-12d3-a456-426614174001"
  })
  currentBookingId!: string;

  @ApiProperty({
    type: String,
    example: "123e4567-e89b-12d3-a456-426614174002"
  })
  nextBookingId!: string;

  @ApiProperty({ type: String, example: "2026-08-03T10:50:00.000Z" })
  scheduledFor!: string;

  @ApiProperty({ type: String, example: "2026-08-03T10:50:01.000Z" })
  createdAt!: string;

  @ApiProperty({
    type: String,
    example: "2026-08-03T10:55:00.000Z",
    nullable: true
  })
  readAt!: string | null;
}

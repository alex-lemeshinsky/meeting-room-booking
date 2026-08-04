import { ApiProperty } from "@nestjs/swagger";
import { NotificationItemDto } from "./notification.dto.js";

export class NotificationsResponseDto {
  @ApiProperty({ type: () => [NotificationItemDto] })
  notifications!: NotificationItemDto[];

  @ApiProperty({ type: Number, example: 3 })
  unreadCount!: number;
}

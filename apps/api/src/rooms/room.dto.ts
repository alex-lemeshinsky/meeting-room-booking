import { ApiProperty } from "@nestjs/swagger";

export class RoomDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, example: "Dnipro" })
  name!: string;

  @ApiProperty({ type: Number, example: 4, minimum: 1 })
  floor!: number;

  @ApiProperty({ type: Number, example: 10, minimum: 1 })
  capacity!: number;
}

export class RoomListResponseDto {
  @ApiProperty({ type: () => RoomDto, isArray: true })
  rooms!: RoomDto[];
}

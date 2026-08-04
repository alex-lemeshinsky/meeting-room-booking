import { ApiProperty } from "@nestjs/swagger";

export class PublicUserDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, example: "Олена" })
  name!: string;

  @ApiProperty({ type: String, example: "olena@example.com", format: "email" })
  email!: string;

  @ApiProperty({ type: Number, example: 1, minimum: 1, maximum: 7 })
  weekStartsOn!: number;
}

import { ApiProperty } from "@nestjs/swagger";

export class PublicUserDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Олена" })
  name!: string;

  @ApiProperty({ example: "olena@example.com", format: "email" })
  email!: string;
}

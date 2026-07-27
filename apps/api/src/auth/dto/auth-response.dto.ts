import { ApiProperty } from "@nestjs/swagger";
import { PublicUserDto } from "../../users/public-user.dto.js";

export class AuthResponseDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;
}

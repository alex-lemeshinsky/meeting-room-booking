import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";

export class VerifyEmailDto {
  @ApiProperty({
    type: String,
    minLength: 43,
    maxLength: 43,
    pattern: "^[A-Za-z0-9_-]{43}$"
  })
  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

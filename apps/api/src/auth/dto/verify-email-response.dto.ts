import { ApiProperty } from "@nestjs/swagger";

export class VerifyEmailResponseDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  verified!: true;
}

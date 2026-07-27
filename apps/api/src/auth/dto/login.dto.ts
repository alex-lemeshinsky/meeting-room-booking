import { Transform } from "class-transformer";
import { IsEmail, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { normalizeEmail } from "../../users/users.service.js";

export class LoginDto {
  @ApiProperty({ type: String, example: "olena@example.com", format: "email" })
  @Transform(({ value }) =>
    typeof value === "string" ? normalizeEmail(value) : value
  )
  @IsEmail({}, { message: "Введіть коректний email" })
  email!: string;

  @ApiProperty({ type: String, example: "Rooms123!", format: "password" })
  @IsString()
  password!: string;
}

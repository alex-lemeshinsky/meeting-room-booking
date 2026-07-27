import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { normalizeEmail } from "../../users/users.service.js";

export class RegisterDto {
  @ApiProperty({ example: "Олена" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "Введіть ім’я" })
  name!: string;

  @ApiProperty({ example: "olena@example.com", format: "email" })
  @Transform(({ value }) =>
    typeof value === "string" ? normalizeEmail(value) : value
  )
  @IsEmail({}, { message: "Введіть коректний email" })
  email!: string;

  @ApiProperty({ example: "Rooms123!", format: "password", minLength: 8 })
  @IsString()
  @Length(8, 72, { message: "Пароль має містити від 8 до 72 символів" })
  password!: string;
}

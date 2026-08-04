import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min } from "class-validator";

export class UpdateMeDto {
  @ApiProperty({ type: Number, example: 1, minimum: 1, maximum: 7 })
  @IsInt({ message: "Виберіть день тижня" })
  @Min(1, { message: "Виберіть день тижня" })
  @Max(7, { message: "Виберіть день тижня" })
  weekStartsOn!: number;
}

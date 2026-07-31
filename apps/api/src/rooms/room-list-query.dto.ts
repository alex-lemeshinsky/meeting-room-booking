import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { AppError } from "../common/errors/app-error.js";

export function parseMinimumCapacity(value: unknown): number | undefined {
  if (value === undefined) return undefined;

  const capacity =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new AppError(400, "VALIDATION_ERROR", "Request validation failed", {
      minCapacity: ["minCapacity must be a positive integer"]
    });
  }

  return capacity;
}

export class RoomListQueryDto {
  @ApiPropertyOptional({
    type: "integer",
    example: 8,
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER
  })
  @Transform(({ value }) => parseMinimumCapacity(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  minCapacity?: number;
}

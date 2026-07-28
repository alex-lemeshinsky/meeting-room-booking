import { ApiProperty } from "@nestjs/swagger";

export class ApiErrorDetailsDto {
  @ApiProperty({ type: String, example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ type: String, example: "Request validation failed" })
  message!: string;

  @ApiProperty({
    additionalProperties: { type: "array", items: { type: "string" } },
    required: false,
    type: Object
  })
  fields?: Record<string, string[]>;

  @ApiProperty({
    type: String,
    example: "b6a3a1f7-07d8-4fd8-a0c5-ff1f5aa9b568"
  })
  requestId!: string;
}

export class ApiErrorDto {
  @ApiProperty({ type: ApiErrorDetailsDto })
  error!: ApiErrorDetailsDto;
}

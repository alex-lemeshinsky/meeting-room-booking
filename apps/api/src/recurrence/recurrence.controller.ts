import { Body, Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import {
  BookingSeriesConflictErrorDto,
  CreateBookingSeriesDto,
  CreateBookingSeriesResponseDto
} from "./dto/create-booking-series.dto.js";
import { RecurrenceService } from "./recurrence.service.js";

@ApiTags("recurrence")
@Controller("booking-series")
export class RecurrenceController {
  constructor(
    @Inject(RecurrenceService) private readonly recurrence: RecurrenceService
  ) {}

  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "createBookingSeries" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiBody({ type: CreateBookingSeriesDto })
  @ApiCreatedResponse({ type: CreateBookingSeriesResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 409, type: BookingSeriesConflictErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  create(
    @Body() input: CreateBookingSeriesDto,
    @Req() request: AuthenticatedRequest
  ): Promise<CreateBookingSeriesResponseDto> {
    return this.recurrence.create(request.auth.user.id, input);
  }
}

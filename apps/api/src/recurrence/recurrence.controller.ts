import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import { CancelBookingSeriesResponseDto } from "./dto/cancel-booking-series.dto.js";
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

  @Post(":seriesId/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "cancelBookingSeries" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiParam({
    name: "seriesId",
    required: true,
    schema: { type: "string", format: "uuid" }
  })
  @ApiOkResponse({ type: CancelBookingSeriesResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 409, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  cancel(
    @Param("seriesId", new ParseUUIDPipe({ version: "4" })) seriesId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<CancelBookingSeriesResponseDto> {
    return this.recurrence.cancel(request.auth.user.id, seriesId);
  }
}

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
import { BookingsService } from "./bookings.service.js";
import {
  CreateBookingDto,
  CreateBookingResponseDto
} from "./dto/create-booking.dto.js";
import { CancelBookingResponseDto } from "./dto/cancel-booking.dto.js";

@ApiTags("bookings")
@Controller("bookings")
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService
  ) {}

  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "createBooking" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiBody({ type: CreateBookingDto })
  @ApiCreatedResponse({ type: CreateBookingResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 409, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  create(
    @Body() input: CreateBookingDto,
    @Req() request: AuthenticatedRequest
  ): Promise<CreateBookingResponseDto> {
    return this.bookings.create(request.auth.user.id, input);
  }

  @Post(":bookingId/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "cancelBooking" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiParam({
    name: "bookingId",
    required: true,
    schema: { type: "string", format: "uuid" }
  })
  @ApiOkResponse({ type: CancelBookingResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 409, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  cancel(
    @Param("bookingId", new ParseUUIDPipe({ version: "4" }))
    bookingId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<CancelBookingResponseDto> {
    return this.bookings.cancel(request.auth.user.id, bookingId);
  }
}

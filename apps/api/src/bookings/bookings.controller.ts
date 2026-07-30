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
import { BookingsService } from "./bookings.service.js";
import {
  CreateBookingDto,
  CreateBookingResponseDto
} from "./dto/create-booking.dto.js";

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
}

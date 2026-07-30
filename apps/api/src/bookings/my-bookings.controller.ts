import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import { BookingsService } from "./bookings.service.js";
import {
  MyBookingsQueryDto,
  MyBookingsResponseDto
} from "./dto/my-bookings.dto.js";

@ApiTags("bookings")
@ApiExtraModels(MyBookingsQueryDto)
@Controller("my-bookings")
@UseGuards(SessionGuard)
export class MyBookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService
  ) {}

  @Get()
  @ApiOperation({ operationId: "listMyBookings" })
  @ApiCookieAuth()
  @ApiQuery({
    name: "section",
    required: true,
    schema: { type: "string", enum: ["upcoming", "history"] }
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    schema: { type: "string" }
  })
  @ApiOkResponse({ type: MyBookingsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  list(
    @Query() query: MyBookingsQueryDto,
    @Req() request: AuthenticatedRequest
  ): Promise<MyBookingsResponseDto> {
    return this.bookings.listMine(request.auth.user.id, query);
  }
}

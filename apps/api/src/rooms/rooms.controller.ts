import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import {
  parseMinimumCapacity,
  RoomListQueryDto
} from "./room-list-query.dto.js";
import { RoomListResponseDto } from "./room.dto.js";
import {
  ScheduleParamsDto,
  ScheduleQueryDto,
  UTC_INSTANT_PATTERN_SOURCE
} from "./schedule-query.dto.js";
import { ScheduleResponseDto } from "./schedule.dto.js";
import { RoomsService } from "./rooms.service.js";

@ApiTags("rooms")
@ApiExtraModels(RoomListQueryDto, ScheduleParamsDto, ScheduleQueryDto)
@Controller("rooms")
@UseGuards(SessionGuard)
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({ operationId: "listRooms" })
  @ApiCookieAuth()
  @ApiQuery({
    name: "minCapacity",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER
    }
  })
  @ApiOkResponse({ type: RoomListResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  async list(@Query() query: RoomListQueryDto): Promise<RoomListResponseDto> {
    return {
      rooms: await this.rooms.list(parseMinimumCapacity(query.minCapacity))
    };
  }

  @Get(":roomId/schedule")
  @ApiOperation({ operationId: "getRoomSchedule" })
  @ApiCookieAuth()
  @ApiParam({
    name: "roomId",
    required: true,
    schema: { type: "string", format: "uuid" }
  })
  @ApiQuery({
    name: "from",
    required: true,
    schema: {
      type: "string",
      format: "date-time",
      pattern: UTC_INSTANT_PATTERN_SOURCE
    }
  })
  @ApiQuery({
    name: "to",
    required: true,
    schema: {
      type: "string",
      format: "date-time",
      pattern: UTC_INSTANT_PATTERN_SOURCE
    }
  })
  @ApiOkResponse({ type: ScheduleResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  schedule(
    @Param() params: ScheduleParamsDto,
    @Query() query: ScheduleQueryDto,
    @Req() request: AuthenticatedRequest
  ): Promise<ScheduleResponseDto> {
    return this.rooms.schedule(
      params.roomId,
      query.from,
      query.to,
      request.auth.user.id
    );
  }
}

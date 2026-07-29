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
import { RoomListResponseDto } from "./room.dto.js";
import { ScheduleParamsDto, ScheduleQueryDto } from "./schedule-query.dto.js";
import { ScheduleResponseDto } from "./schedule.dto.js";
import { RoomsService } from "./rooms.service.js";

@ApiTags("rooms")
@ApiExtraModels(ScheduleParamsDto, ScheduleQueryDto)
@Controller("rooms")
@UseGuards(SessionGuard)
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({ operationId: "listRooms" })
  @ApiCookieAuth()
  @ApiOkResponse({ type: RoomListResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  async list(): Promise<RoomListResponseDto> {
    return { rooms: await this.rooms.list() };
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
    schema: { type: "string", format: "date-time" }
  })
  @ApiQuery({
    name: "to",
    required: true,
    schema: { type: "string", format: "date-time" }
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

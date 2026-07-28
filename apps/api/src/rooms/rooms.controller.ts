import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import { RoomListResponseDto } from "./room.dto.js";
import { RoomsService } from "./rooms.service.js";

@ApiTags("rooms")
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
}

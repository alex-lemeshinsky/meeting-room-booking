import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard.js";
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
  async list(): Promise<RoomListResponseDto> {
    return { rooms: await this.rooms.list() };
  }
}

import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/guards/session.guard.js";
import type { RoomDto } from "./room.dto.js";
import { RoomsService } from "./rooms.service.js";

@Controller("rooms")
@UseGuards(SessionGuard)
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  async list(): Promise<{ rooms: RoomDto[] }> {
    return { rooms: await this.rooms.list() };
  }
}

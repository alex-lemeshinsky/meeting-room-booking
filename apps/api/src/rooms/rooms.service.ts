import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { RoomDto } from "./room.dto.js";

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(): Promise<RoomDto[]> {
    return this.database.room.findMany({
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      select: { id: true, name: true, floor: true, capacity: true }
    });
  }
}

import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { RoomsService } from "./rooms.service.js";

@Module({
  exports: [RoomsService],
  imports: [DatabaseModule],
  providers: [RoomsService]
})
export class RoomsModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";

@Module({
  controllers: [RoomsController],
  imports: [AuthModule, DatabaseModule],
  providers: [RoomsService]
})
export class RoomsModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(process.cwd(), "../../.env"),
      isGlobal: true
    }),
    DatabaseModule,
    HealthModule
  ]
})
export class AppModule {}

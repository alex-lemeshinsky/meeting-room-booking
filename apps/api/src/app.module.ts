import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module.js";
import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolve(process.cwd(), "../../.env"),
      isGlobal: true
    }),
    CommonModule,
    DatabaseModule,
    HealthModule,
    AuthModule
  ]
})
export class AppModule {}

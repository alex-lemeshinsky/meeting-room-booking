import { Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "@mrb/time";
import { DatabaseService } from "../database/database.service.js";
import { HealthController } from "../health/health.controller.js";
import { HealthService } from "../health/health.service.js";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: DatabaseService, useValue: { ping: async () => undefined } }
  ]
})
export class OpenApiModule {}

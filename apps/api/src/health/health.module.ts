import { Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "@mrb/time";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: CLOCK, useClass: SystemClock }
  ]
})
export class HealthModule {}

import { Controller, Get, Inject } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get("live")
  live(): { status: "ok"; now: string } {
    return this.health.live();
  }

  @Get("ready")
  ready(): Promise<{ status: "ok"; database: "up" }> {
    return this.health.ready();
  }
}

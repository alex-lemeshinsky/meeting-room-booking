import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  live(): { status: "ok"; now: string } {
    return this.health.live();
  }
}

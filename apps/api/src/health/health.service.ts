import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "@mrb/time";

@Injectable()
export class HealthService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  live(): { status: "ok"; now: string } {
    return { status: "ok", now: this.clock.now().toISOString() };
  }
}

import {
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { CLOCK, type Clock } from "@mrb/time";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class HealthService {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  live(): { status: "ok"; now: string } {
    return { status: "ok", now: this.clock.now().toISOString() };
  }

  async ready(): Promise<{ status: "ok"; database: "up" }> {
    try {
      await this.database.ping();
      return { status: "ok", database: "up" };
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database is unavailable"
        }
      });
    }
  }
}

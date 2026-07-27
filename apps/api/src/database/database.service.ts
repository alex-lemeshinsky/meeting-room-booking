import { PrismaPg } from "@prisma/adapter-pg";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ConfigService) config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      connectionTimeoutMillis: 5_000
    });
    super({ adapter });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

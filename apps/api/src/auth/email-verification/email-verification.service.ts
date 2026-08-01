import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  EMAIL_VERIFICATION_TOKEN_GENERATOR,
  hashVerificationToken,
  type EmailVerificationTokenGenerator
} from "./verification-token.js";

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1_000;

type VerificationTokenWriter = Pick<
  Prisma.TransactionClient,
  "emailVerificationToken"
>;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_GENERATOR)
    private readonly generator: EmailVerificationTokenGenerator,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async issueForUser(
    userId: string,
    transaction: VerificationTokenWriter = this.database
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const rawToken = this.generator.generate();
    const expiresAt = new Date(this.clock.now().getTime() + TOKEN_LIFETIME_MS);

    await transaction.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashVerificationToken(rawToken),
        expiresAt
      }
    });

    return { rawToken, expiresAt };
  }

  logDevelopmentLink(rawToken: string): void {
    const nodeEnv = this.config.get<string>("NODE_ENV");
    if (nodeEnv === "production" || nodeEnv === "test") return;

    const url = new URL(
      "/verify-email",
      this.config.getOrThrow<string>("APP_ORIGIN")
    );
    url.searchParams.set("token", rawToken);
    this.logger.log(`Email verification link: ${url.toString()}`);
  }
}

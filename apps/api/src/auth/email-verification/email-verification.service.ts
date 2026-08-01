import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppError } from "../../common/errors/app-error.js";
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

  async verify(rawToken: string): Promise<{ verified: true }> {
    const tokenHash = hashVerificationToken(rawToken);
    const now = this.clock.now();

    return this.database.$transaction(async (transaction) => {
      const token = await transaction.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true
        }
      });

      if (token === null) throw invalidToken();
      if (token.usedAt !== null) throw usedToken();
      if (token.expiresAt.getTime() <= now.getTime()) throw expiredToken();

      const consumed = await transaction.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          expiresAt: { gt: now }
        },
        data: { usedAt: now }
      });
      if (consumed.count !== 1) throw usedToken();

      await transaction.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now }
      });

      return { verified: true };
    });
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

function invalidToken(): AppError {
  return new AppError(
    400,
    "EMAIL_VERIFICATION_TOKEN_INVALID",
    "Email verification token is invalid"
  );
}

function expiredToken(): AppError {
  return new AppError(
    410,
    "EMAIL_VERIFICATION_TOKEN_EXPIRED",
    "Email verification token has expired"
  );
}

function usedToken(): AppError {
  return new AppError(
    409,
    "EMAIL_VERIFICATION_TOKEN_USED",
    "Email verification token has already been used"
  );
}

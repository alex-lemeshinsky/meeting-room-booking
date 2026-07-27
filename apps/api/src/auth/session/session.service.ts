import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth.types.js";
import { AppError } from "../../common/errors/app-error.js";
import { DatabaseService } from "../../database/database.service.js";
import { createSecret, hashSecret } from "./session-crypto.js";
import {
  calculateNextIdleExpiry,
  calculateSessionWindow,
  isSessionExpired
} from "./session-policy.js";

export interface CreatedSession {
  sessionSecret: string;
  csrfSecret: string;
  absoluteExpiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  async createSession(userId: string): Promise<CreatedSession> {
    const sessionSecret = createSecret();
    const csrfSecret = createSecret();
    const window = calculateSessionWindow(this.clock.now());

    await this.database.session.create({
      data: {
        userId,
        tokenHash: hashSecret(sessionSecret),
        csrfTokenHash: hashSecret(csrfSecret),
        lastSeenAt: window.lastSeenAt,
        idleExpiresAt: window.idleExpiresAt,
        absoluteExpiresAt: window.absoluteExpiresAt
      }
    });

    return {
      sessionSecret,
      csrfSecret,
      absoluteExpiresAt: new Date(window.absoluteExpiresAt)
    };
  }

  async authenticate(sessionSecret: string | undefined): Promise<AuthContext> {
    if (!sessionSecret) throw unauthenticated();

    const session = await this.database.session.findUnique({
      where: { tokenHash: hashSecret(sessionSecret) },
      include: { user: true }
    });
    if (!session) throw unauthenticated();

    const now = this.clock.now();
    if (
      isSessionExpired(now, session.idleExpiresAt, session.absoluteExpiresAt)
    ) {
      throw unauthenticated();
    }

    const update = await this.database.session.updateMany({
      where: {
        id: session.id,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now }
      },
      data: {
        lastSeenAt: new Date(now),
        idleExpiresAt: calculateNextIdleExpiry(now, session.absoluteExpiresAt)
      }
    });
    if (update.count !== 1) throw unauthenticated();

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.emailNormalized
      },
      session: {
        id: session.id,
        csrfTokenHash: session.csrfTokenHash,
        absoluteExpiresAt: new Date(session.absoluteExpiresAt)
      }
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.session.deleteMany({ where: { id: sessionId } });
  }
}

function unauthenticated(): AppError {
  return new AppError(401, "UNAUTHENTICATED", "Authentication is required");
}

import { Inject, Injectable } from "@nestjs/common";
import {
  PASSWORD_HASHER,
  type PasswordHasher
} from "./password/password-hasher.js";
import {
  normalizeEmail,
  type PublicUser,
  UsersService
} from "../users/users.service.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthResponseDto } from "./dto/auth-response.dto.js";
import type { LoginDto } from "./dto/login.dto.js";
import type { RegisterDto } from "./dto/register.dto.js";
import {
  SessionService,
  type CreatedSession
} from "./session/session.service.js";
import { DatabaseService } from "../database/database.service.js";
import { EmailVerificationService } from "./email-verification/email-verification.service.js";

export interface LoginResult {
  user: PublicUser;
  session: CreatedSession;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailVerificationService)
    private readonly emailVerification: EmailVerificationService
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await this.passwords.hash(input.password);
    const result = await this.database.$transaction(async (transaction) => {
      const user = await this.users.createUser(
        {
          name: input.name,
          emailNormalized: normalizeEmail(input.email),
          passwordHash
        },
        transaction
      );
      const verification = await this.emailVerification.issueForUser(
        user.id,
        transaction
      );
      return { user, rawToken: verification.rawToken };
    });

    this.emailVerification.logDevelopmentLink(result.rawToken);
    return { user: this.users.toPublicUser(result.user) };
  }

  async login(input: LoginDto): Promise<LoginResult> {
    const user = await this.users.findByNormalizedEmail(
      normalizeEmail(input.email)
    );
    if (!user) {
      await this.passwords.burnUnknownPasswordCheck(input.password);
      throw invalidCredentials();
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw invalidCredentials();
    }

    return {
      user: this.users.toPublicUser(user),
      session: await this.sessions.createSession(user.id)
    };
  }
}

function invalidCredentials(): AppError {
  return new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
}

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

export interface LoginResult {
  user: PublicUser;
  session: CreatedSession;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.users.createUser({
      name: input.name,
      emailNormalized: normalizeEmail(input.email),
      passwordHash: await this.passwords.hash(input.password)
    });

    return { user: this.users.toPublicUser(user) };
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

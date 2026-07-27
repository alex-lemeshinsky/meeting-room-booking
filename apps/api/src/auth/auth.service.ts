import { Inject, Injectable } from "@nestjs/common";
import {
  PASSWORD_HASHER,
  type PasswordHasher
} from "./password/password-hasher.js";
import { normalizeEmail, UsersService } from "../users/users.service.js";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: { id: string; name: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const user = await this.users.createUser({
      name: input.name,
      emailNormalized: normalizeEmail(input.email),
      passwordHash: await this.passwords.hash(input.password)
    });

    return { user: this.users.toPublicUser(user) };
  }
}

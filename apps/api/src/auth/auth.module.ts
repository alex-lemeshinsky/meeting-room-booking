import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./guards/csrf.guard.js";
import { PreAuthMutationGuard } from "./guards/pre-auth-mutation.guard.js";
import { SessionGuard } from "./guards/session.guard.js";
import { Argon2PasswordHasher } from "./password/argon2-password-hasher.js";
import { PASSWORD_HASHER } from "./password/password-hasher.js";
import { CookieService } from "./session/cookie.service.js";
import { SessionService } from "./session/session.service.js";

@Module({
  controllers: [AuthController],
  exports: [SessionGuard, SessionService],
  imports: [UsersModule],
  providers: [
    AuthService,
    CookieService,
    PreAuthMutationGuard,
    CsrfGuard,
    SessionGuard,
    SessionService,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }
  ]
})
export class AuthModule {}

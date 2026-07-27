import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PreAuthMutationGuard } from "./guards/pre-auth-mutation.guard.js";
import { Argon2PasswordHasher } from "./password/argon2-password-hasher.js";
import { PASSWORD_HASHER } from "./password/password-hasher.js";

@Module({
  controllers: [AuthController],
  imports: [UsersModule],
  providers: [
    AuthService,
    PreAuthMutationGuard,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }
  ]
})
export class AuthModule {}

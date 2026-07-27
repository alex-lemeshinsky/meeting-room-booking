import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { CSRF_COOKIE } from "../session/cookie.service.js";
import { isMatchingSecret } from "../session/session-crypto.js";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const appOrigin = this.config.getOrThrow<string>("APP_ORIGIN");

    if (request.header("origin") !== appOrigin) {
      throw new AppError(403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
    }
    if (!request.is("application/json")) {
      throw new AppError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json"
      );
    }

    const csrfTokenHash = request.auth?.session.csrfTokenHash;
    const cookieSecret = request.cookies?.[CSRF_COOKIE];
    const headerSecret = request.header("x-csrf-token");
    if (
      !csrfTokenHash ||
      typeof cookieSecret !== "string" ||
      !headerSecret ||
      !isMatchingSecret(cookieSecret, csrfTokenHash) ||
      !isMatchingSecret(headerSecret, csrfTokenHash)
    ) {
      throw new AppError(403, "CSRF_INVALID", "CSRF token is invalid");
    }

    return true;
  }
}

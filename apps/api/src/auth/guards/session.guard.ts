import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable
} from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "../session/session.service.js";
import { SESSION_COOKIE } from "../session/cookie.service.js";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionSecret = request.cookies?.[SESSION_COOKIE];

    request.auth = await this.sessions.authenticate(
      typeof sessionSecret === "string" ? sessionSecret : undefined
    );
    return true;
  }
}

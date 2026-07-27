import { Injectable } from "@nestjs/common";
import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE = "mrb_session";
export const CSRF_COOKIE = "mrb_csrf";

export interface SessionCookieSecrets {
  sessionSecret: string;
  csrfSecret: string;
}

@Injectable()
export class CookieService {
  setSessionCookies(
    response: Response,
    secrets: SessionCookieSecrets,
    absoluteExpiresAt: Date
  ): void {
    response.cookie(SESSION_COOKIE, secrets.sessionSecret, {
      ...this.scopeOptions(),
      expires: new Date(absoluteExpiresAt),
      httpOnly: true
    });
    response.cookie(CSRF_COOKIE, secrets.csrfSecret, {
      ...this.scopeOptions(),
      expires: new Date(absoluteExpiresAt),
      httpOnly: false
    });
  }

  clearSessionCookies(response: Response): void {
    response.clearCookie(SESSION_COOKIE, {
      ...this.scopeOptions(),
      httpOnly: true
    });
    response.clearCookie(CSRF_COOKIE, {
      ...this.scopeOptions(),
      httpOnly: false
    });
  }

  private scopeOptions(): Pick<CookieOptions, "path" | "sameSite" | "secure"> {
    return {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    };
  }
}

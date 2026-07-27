import type { Request } from "express";
import type { PublicUser } from "../users/users.service.js";

export interface AuthContext {
  user: PublicUser;
  session: {
    id: string;
    csrfTokenHash: string;
    absoluteExpiresAt: Date;
  };
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

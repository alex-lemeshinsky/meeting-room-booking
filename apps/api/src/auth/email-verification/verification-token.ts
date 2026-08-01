import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_TOKEN_GENERATOR = Symbol(
  "EmailVerificationTokenGenerator"
);

export interface EmailVerificationTokenGenerator {
  generate(): string;
}

@Injectable()
export class NodeEmailVerificationTokenGenerator implements EmailVerificationTokenGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

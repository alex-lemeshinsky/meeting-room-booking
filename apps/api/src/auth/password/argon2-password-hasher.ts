import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { PasswordHasher } from "./password-hasher.js";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly dummyHash = argon2.hash(
    randomBytes(32).toString("base64url"),
    ARGON2_OPTIONS
  );

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async burnUnknownPasswordCheck(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }
}

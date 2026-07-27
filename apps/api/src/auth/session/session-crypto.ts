import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_BYTES = 32;
const SHA256_HEX_LENGTH = 64;
const BASE64URL_SECRET = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export function createSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function isMatchingSecret(secret: string, storedHash: string): boolean {
  if (!isValidSecret(secret) || !SHA256_HEX.test(storedHash)) return false;

  const expected = Buffer.from(storedHash, "hex");
  if (expected.length !== SHA256_HEX_LENGTH / 2) return false;

  const actual = Buffer.from(hashSecret(secret), "hex");
  return timingSafeEqual(actual, expected);
}

function isValidSecret(secret: string): boolean {
  return (
    BASE64URL_SECRET.test(secret) &&
    Buffer.from(secret, "base64url").length === SECRET_BYTES
  );
}

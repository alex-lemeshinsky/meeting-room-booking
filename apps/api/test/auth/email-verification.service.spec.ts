import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { FixedClock } from "@mrb/time";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailVerificationService } from "../../src/auth/email-verification/email-verification.service.js";
import {
  hashVerificationToken,
  type EmailVerificationTokenGenerator
} from "../../src/auth/email-verification/verification-token.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import type { Prisma } from "../../src/generated/prisma/client.js";

const USER_ID = "c40b96ad-6035-4b0c-aa18-9ad901813a96";
const RAW_TOKEN = "A".repeat(43);
const NOW = new Date("2026-08-01T09:00:00.000Z");

describe("EmailVerificationService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("persists only a token hash with a 24-hour expiry", async () => {
    const create = vi.fn().mockResolvedValue({});
    const transaction = {
      emailVerificationToken: { create }
    } as unknown as Pick<Prisma.TransactionClient, "emailVerificationToken">;
    const service = createService("development");

    await expect(service.issueForUser(USER_ID, transaction)).resolves.toEqual({
      rawToken: RAW_TOKEN,
      expiresAt: new Date("2026-08-02T09:00:00.000Z")
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        tokenHash: hashVerificationToken(RAW_TOKEN),
        expiresAt: new Date("2026-08-02T09:00:00.000Z")
      }
    });
  });

  it("logs a local verification URL containing the raw token", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const service = createService("development");

    service.logDevelopmentLink(RAW_TOKEN);

    expect(log).toHaveBeenCalledOnce();
    const message = String(log.mock.calls[0]?.[0]);
    const match = message.match(/https?:\/\/\S+/);
    expect(match).not.toBeNull();
    const url = new URL(match?.[0] ?? "http://invalid");
    expect(url.origin).toBe("http://127.0.0.1:3000");
    expect(url.pathname).toBe("/verify-email");
    expect(url.searchParams.get("token")).toBe(RAW_TOKEN);
  });

  it.each(["production", "test"])(
    "does not log verification tokens in %s",
    (nodeEnv) => {
      const log = vi
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => {});
      const service = createService(nodeEnv);

      service.logDevelopmentLink(RAW_TOKEN);

      expect(log).not.toHaveBeenCalled();
    }
  );
});

function createService(nodeEnv: string): EmailVerificationService {
  const generator: EmailVerificationTokenGenerator = {
    generate: () => RAW_TOKEN
  };
  const config = {
    get: (key: string) => (key === "NODE_ENV" ? nodeEnv : undefined),
    getOrThrow: (key: string) => {
      if (key === "APP_ORIGIN") return "http://127.0.0.1:3000";
      throw new Error(`Missing config: ${key}`);
    }
  } as ConfigService;

  return new EmailVerificationService(
    generator,
    {} as DatabaseService,
    new FixedClock(NOW),
    config
  );
}

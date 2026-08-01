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
const TOKEN_ID = "7ad1290b-1f21-4cf4-a6b2-21a2834ba6c2";
const RAW_TOKEN = "A".repeat(43);
const NOW = new Date("2026-08-01T09:00:00.000Z");
const ACTIVE_EXPIRY = new Date("2026-08-02T09:00:00.000Z");

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

  it.each([
    [null, { status: 400, code: "EMAIL_VERIFICATION_TOKEN_INVALID" }],
    [
      {
        id: TOKEN_ID,
        userId: USER_ID,
        expiresAt: NOW,
        usedAt: null
      },
      { status: 410, code: "EMAIL_VERIFICATION_TOKEN_EXPIRED" }
    ],
    [
      {
        id: TOKEN_ID,
        userId: USER_ID,
        expiresAt: NOW,
        usedAt: new Date("2026-08-01T08:00:00.000Z")
      },
      { status: 409, code: "EMAIL_VERIFICATION_TOKEN_USED" }
    ]
  ])("classifies token state %#", async (stored, expected) => {
    const harness = verificationHarness();
    harness.findUnique.mockResolvedValue(stored);

    await expect(harness.service.verify(RAW_TOKEN)).rejects.toMatchObject(
      expected
    );

    expect(harness.consumeToken).not.toHaveBeenCalled();
    expect(harness.verifyUser).not.toHaveBeenCalled();
  });

  it("consumes an active token and verifies its user in one transaction", async () => {
    const harness = verificationHarness();
    harness.findUnique.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: ACTIVE_EXPIRY,
      usedAt: null
    });
    harness.consumeToken.mockResolvedValue({ count: 1 });
    harness.verifyUser.mockResolvedValue({ count: 1 });

    await expect(harness.service.verify(RAW_TOKEN)).resolves.toEqual({
      verified: true
    });

    expect(harness.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash:
          "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true
      }
    });
    expect(harness.consumeToken).toHaveBeenCalledWith({
      where: {
        id: TOKEN_ID,
        usedAt: null,
        expiresAt: { gt: NOW }
      },
      data: { usedAt: NOW }
    });
    expect(harness.verifyUser).toHaveBeenCalledWith({
      where: { id: USER_ID, emailVerifiedAt: null },
      data: { emailVerifiedAt: NOW }
    });
  });

  it("reports a concurrent loser as used without updating the user", async () => {
    const harness = verificationHarness();
    harness.findUnique.mockResolvedValue({
      id: TOKEN_ID,
      userId: USER_ID,
      expiresAt: ACTIVE_EXPIRY,
      usedAt: null
    });
    harness.consumeToken.mockResolvedValue({ count: 0 });

    await expect(harness.service.verify(RAW_TOKEN)).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_VERIFICATION_TOKEN_USED"
    });

    expect(harness.verifyUser).not.toHaveBeenCalled();
  });
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

function verificationHarness(): {
  service: EmailVerificationService;
  findUnique: ReturnType<typeof vi.fn>;
  consumeToken: ReturnType<typeof vi.fn>;
  verifyUser: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn();
  const consumeToken = vi.fn();
  const verifyUser = vi.fn();
  const transaction = {
    emailVerificationToken: {
      findUnique,
      updateMany: consumeToken
    },
    user: { updateMany: verifyUser }
  };
  const database = {
    $transaction: vi.fn(async (work) => work(transaction))
  } as unknown as DatabaseService;
  const generator: EmailVerificationTokenGenerator = {
    generate: () => RAW_TOKEN
  };
  const config = {
    get: () => "test",
    getOrThrow: () => "http://127.0.0.1:3000"
  } as unknown as ConfigService;

  return {
    service: new EmailVerificationService(
      generator,
      database,
      new FixedClock(NOW),
      config
    ),
    findUnique,
    consumeToken,
    verifyUser
  };
}

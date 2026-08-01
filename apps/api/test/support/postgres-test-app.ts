import type { INestApplication } from "@nestjs/common";
import type { Clock } from "@mrb/time";
import { CLOCK } from "@mrb/time";
import { Test } from "@nestjs/testing";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { AppModule } from "../../src/app.module.js";
import {
  EMAIL_VERIFICATION_TOKEN_GENERATOR,
  type EmailVerificationTokenGenerator
} from "../../src/auth/email-verification/verification-token.js";
import { configureApp, createApp } from "../../src/bootstrap.js";

export interface PostgresTestApp {
  app: INestApplication;
  postgres: StartedPostgreSqlContainer;
  databaseUrl: string;
  stop(): Promise<void>;
}

export interface PostgresTestAppOptions {
  seed?: boolean;
  clock?: Clock;
  verificationTokenGenerator?: EmailVerificationTokenGenerator;
}

export function runPrismaCommand(args: string[], label: string): void {
  const command = spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: resolve(import.meta.dirname, "../../../.."),
    env: process.env,
    encoding: "utf8"
  });

  if (command.status !== 0) {
    throw new Error(`Prisma ${label} failed:\n${command.stderr}`);
  }
}

export async function startPostgresTestApp(
  options: PostgresTestAppOptions = {}
): Promise<PostgresTestApp> {
  const postgres = await new PostgreSqlContainer(
    "postgres:18.4-alpine"
  ).start();
  const databaseUrl = postgres.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  let app: INestApplication | undefined;

  try {
    runPrismaCommand(["migrate", "deploy"], "migration");

    if (options.seed) {
      runPrismaCommand(["db", "seed"], "seed");
    }

    if (options.clock || options.verificationTokenGenerator) {
      let builder = Test.createTestingModule({ imports: [AppModule] });
      if (options.clock) {
        builder = builder.overrideProvider(CLOCK).useValue(options.clock);
      }
      if (options.verificationTokenGenerator) {
        builder = builder
          .overrideProvider(EMAIL_VERIFICATION_TOKEN_GENERATOR)
          .useValue(options.verificationTokenGenerator);
      }
      const module = await builder.compile();
      app = configureApp(module.createNestApplication({ bufferLogs: true }));
    } else {
      app = await createApp();
    }
    const initializedApp = app;
    await initializedApp.init();

    return {
      app: initializedApp,
      postgres,
      databaseUrl,
      async stop(): Promise<void> {
        try {
          await initializedApp.close();
        } finally {
          await postgres.stop();
        }
      }
    };
  } catch (error) {
    try {
      await app?.close();
    } finally {
      await postgres.stop();
    }
    throw error;
  }
}

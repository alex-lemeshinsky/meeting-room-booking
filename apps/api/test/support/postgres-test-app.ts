import type { INestApplication } from "@nestjs/common";
import type { Clock } from "@mrb/time";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createApp } from "../../src/bootstrap.js";

export interface PostgresTestApp {
  app: INestApplication;
  postgres: StartedPostgreSqlContainer;
  databaseUrl: string;
  stop(): Promise<void>;
}

export interface PostgresTestAppOptions {
  seed?: boolean;
  clock?: Clock;
}

function runPrismaCommand(args: string[], label: string): void {
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
  const postgres = await new PostgreSqlContainer("postgres:18.4-alpine").start();
  const databaseUrl = postgres.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";

  try {
    runPrismaCommand(["migrate", "deploy"], "migration");

    if (options.seed) {
      runPrismaCommand(["db", "seed"], "seed");
    }

    const app = await createApp();
    await app.init();

    return {
      app,
      postgres,
      databaseUrl,
      async stop(): Promise<void> {
        try {
          await app.close();
        } finally {
          await postgres.stop();
        }
      }
    };
  } catch (error) {
    await postgres.stop();
    throw error;
  }
}

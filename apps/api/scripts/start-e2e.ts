import { spawn, spawnSync, type SpawnSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";
import { E2eLifecycle } from "./e2e-launcher.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

function runPrisma(
  args: string[],
  label: string,
  options: SpawnSyncOptions
): void {
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], options);

  if (result.status !== 0) {
    throw new Error(`Prisma ${label} failed.`);
  }
}

const lifecycle = new E2eLifecycle();

process.once("SIGINT", () => lifecycle.requestShutdown(130));
process.once("SIGTERM", () => lifecycle.requestShutdown(143));

try {
  if (!lifecycle.isShutdownRequested) {
    const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
      "postgres:18.4-alpine"
    ).start();
    lifecycle.attachPostgres(postgres);

    if (!lifecycle.isShutdownRequested) {
      const databaseUrl = postgres.getConnectionUri();
      const environment = {
        ...process.env,
        DATABASE_URL: databaseUrl,
        APP_ORIGIN: "http://127.0.0.1:3000",
        NODE_ENV: "test",
        PORT: "3001"
      };
      const commandOptions = {
        cwd: repositoryRoot,
        env: environment,
        stdio: "inherit" as const
      };

      runPrisma(["migrate", "deploy"], "migration", commandOptions);
      runPrisma(["db", "seed"], "seed", commandOptions);

      const api = spawn(
        "pnpm",
        ["--filter", "@mrb/api", "exec", "tsx", "src/main.ts"],
        commandOptions
      );
      lifecycle.attachApi(api);

      if (!lifecycle.isShutdownRequested) {
        const exit = await lifecycle.waitForApiExit();
        if (exit.error) {
          console.error("E2E API process failed to start.");
        } else if (exit.code !== 0 || exit.signal !== null) {
          console.error("E2E API process exited unexpectedly.");
        }
        lifecycle.requestShutdown(
          exit.code === 0 && exit.signal === null && !exit.error ? 0 : 1
        );
      }
    }
  }
} catch {
  console.error("E2E launcher startup failed.");
  lifecycle.requestShutdown(1);
} finally {
  if (!(await lifecycle.finalize())) {
    console.error("E2E API process did not exit after shutdown.");
  }
  process.exitCode = lifecycle.exitCode;
}

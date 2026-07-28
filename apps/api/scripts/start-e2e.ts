import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnSyncOptions
} from "node:child_process";
import { resolve } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer
} from "@testcontainers/postgresql";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

let api: ChildProcess | undefined;
let postgres: StartedPostgreSqlContainer | undefined;
let cleanup: Promise<void> | undefined;

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

async function stop(exitCode: number): Promise<void> {
  if (!cleanup) {
    cleanup = (async () => {
      if (api && api.exitCode === null && !api.killed) {
        api.kill("SIGTERM");
      }

      await postgres?.stop();
    })();
  }

  try {
    await cleanup;
  } finally {
    process.exitCode = exitCode;
  }
}

function stopForSignal(exitCode: number): void {
  void stop(exitCode);
}

process.once("SIGINT", () => stopForSignal(130));
process.once("SIGTERM", () => stopForSignal(143));

try {
  postgres = await new PostgreSqlContainer("postgres:18.4-alpine").start();
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

  api = spawn(
    "pnpm",
    ["--filter", "@mrb/api", "exec", "tsx", "src/main.ts"],
    commandOptions
  );

  api.once("error", () => {
    void stop(1);
  });
  api.once("exit", (code, signal) => {
    void stop(code === 0 && signal === null ? 0 : 1);
  });
} catch {
  await stop(1);
}

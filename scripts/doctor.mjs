import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL, URL } from "node:url";
import { promisify } from "node:util";

import { checkEnvironment } from "./environment-preflight.mjs";

const executeFile = promisify(execFile);

export function createCommandRunner(options = {}) {
  const {
    execute = executeFile,
    platform = process.platform,
    commandShell = process.env.ComSpec ?? "cmd.exe"
  } = options;

  if (platform === "win32") {
    return (command, args) =>
      execute(commandShell, ["/d", "/s", "/c", [command, ...args].join(" ")]);
  }

  return (command, args) => execute(command, args);
}

async function readRootPackage() {
  const contents = await readFile(new URL("../package.json", import.meta.url), {
    encoding: "utf8"
  });
  return JSON.parse(contents);
}

function readDatabaseUrlFromEnv(contents) {
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;

    const value = match[1];
    if (!value) return undefined;

    const quote = value.at(0);
    if (
      (quote === '"' || quote === "'") &&
      value.at(-1) === quote &&
      value.length >= 2
    ) {
      return value.slice(1, -1).trim() || undefined;
    }

    return value;
  }

  return undefined;
}

async function resolveDatabaseUrl(databaseUrl, readEnvFile) {
  if (databaseUrl?.trim()) return databaseUrl.trim();

  try {
    return readDatabaseUrlFromEnv(await readEnvFile());
  } catch {
    return undefined;
  }
}

export async function main(options = {}) {
  const {
    nodeVersion = process.version,
    packageJson = await readRootPackage(),
    runCommand = createCommandRunner(),
    databaseUrl = process.env.DATABASE_URL,
    readEnvFile = () =>
      readFile(new URL("../.env", import.meta.url), { encoding: "utf8" }),
    writeLine = console.log
  } = options;
  const environment = await checkEnvironment({
    nodeVersion,
    packageJson,
    runCommand
  });
  const configuredDatabaseUrl = await resolveDatabaseUrl(
    databaseUrl,
    readEnvFile
  );
  const databaseCheck = configuredDatabaseUrl
    ? ["✓ DATABASE_URL is configured"]
    : ["✗ DATABASE_URL is not configured", "  Run: cp .env.example .env"];
  const result = {
    ok: environment.ok && Boolean(configuredDatabaseUrl),
    lines: [
      environment.ok && configuredDatabaseUrl
        ? "environment ready"
        : "environment not ready",
      ...environment.lines.slice(1),
      ...databaseCheck
    ]
  };

  for (const line of result.lines) writeLine(line);
  return result.ok ? 0 : 1;
}

const isExecutable =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isExecutable) process.exitCode = await main();

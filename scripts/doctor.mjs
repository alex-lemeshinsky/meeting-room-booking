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

export async function main(options = {}) {
  const {
    nodeVersion = process.version,
    packageJson = await readRootPackage(),
    runCommand = createCommandRunner(),
    writeLine = console.log
  } = options;
  const result = await checkEnvironment({
    nodeVersion,
    packageJson,
    runCommand
  });

  for (const line of result.lines) writeLine(line);
  return result.ok ? 0 : 1;
}

const isExecutable =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isExecutable) process.exitCode = await main();

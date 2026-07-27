import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

import { createCommandRunner, main } from "./doctor.mjs";
import { checkEnvironment } from "./environment-preflight.mjs";

const validPackage = {
  engines: { node: "24.18.x" },
  packageManager: "pnpm@11.17.0"
};
const executeFile = promisify(execFile);

function commandRunner(results = {}) {
  return async (command, args) => {
    const key = [command, ...args].join(" ");
    const result = results[key];

    if (result instanceof Error) throw result;
    if (result === undefined) return { stdout: "" };
    return { stdout: result };
  };
}

function passingRunner(overrides = {}) {
  return commandRunner({
    "pnpm --version": "11.17.0\n",
    "docker --version": "Docker version 28.0.0\n",
    "docker compose version": "Docker Compose version v2.35.0\n",
    ...overrides
  });
}

test("reports every supported prerequisite when the environment is ready", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.7",
    packageJson: validPackage,
    runCommand: passingRunner()
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, [
    "environment ready",
    "✓ Node.js 24.18.7 satisfies 24.18.x",
    "✓ pnpm 11.17.0 satisfies pnpm@11.17.0",
    "✓ Docker CLI is available",
    "✓ Docker Compose plugin is available"
  ]);
});

test("rejects Node major and minor mismatches while accepting patch variation", async () => {
  for (const nodeVersion of ["v23.18.0", "v24.17.9"]) {
    const result = await checkEnvironment({
      nodeVersion,
      packageJson: validPackage,
      runCommand: passingRunner()
    });

    assert.equal(result.ok, false);
    assert.match(result.lines[1], /does not satisfy 24\.18\.x/);
    assert.equal(result.lines[2], "  Run: nvm install && nvm use");
  }

  const accepted = await checkEnvironment({
    nodeVersion: "v24.18.99",
    packageJson: validPackage,
    runCommand: passingRunner()
  });
  assert.equal(accepted.ok, true);
});

test("reports unavailable and wrong-version pnpm", async () => {
  const unavailable = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({
      "pnpm --version": new Error("ENOENT")
    })
  });
  assert.deepEqual(unavailable.lines.slice(2, 4), [
    "✗ pnpm is unavailable; expected pnpm@11.17.0",
    "  Run: npm install --global pnpm@11.17.0"
  ]);

  const wrongVersion = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({ "pnpm --version": "11.16.0\n" })
  });
  assert.deepEqual(wrongVersion.lines.slice(2, 4), [
    "✗ pnpm 11.16.0 does not satisfy pnpm@11.17.0",
    "  Run: npm install --global pnpm@11.17.0"
  ]);

  const emptyVersion = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({ "pnpm --version": " \n" })
  });
  assert.deepEqual(emptyVersion.lines.slice(2, 4), [
    "✗ pnpm is unavailable; expected pnpm@11.17.0",
    "  Run: npm install --global pnpm@11.17.0"
  ]);
});

test("reports missing Docker CLI", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({
      "docker --version": new Error("ENOENT")
    })
  });

  assert.ok(result.lines.includes("✗ Docker CLI is unavailable"));
  assert.ok(
    result.lines.includes(
      "  Install Docker Desktop or another Docker distribution with Compose support."
    )
  );
});

test("reports missing Docker Compose plugin", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({
      "docker compose version": new Error("plugin unavailable")
    })
  });

  assert.ok(result.lines.includes("✗ Docker Compose plugin is unavailable"));
  assert.ok(
    result.lines.includes("  Install or enable the Docker Compose plugin.")
  );
});

test("uses Docker command exit status without constraining version output", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner({
      "docker --version": "",
      "docker compose version": ""
    })
  });

  assert.equal(result.ok, true);
  assert.ok(result.lines.includes("✓ Docker CLI is available"));
  assert.ok(result.lines.includes("✓ Docker Compose plugin is available"));
});

test("aggregates failures in deterministic prerequisite order", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.10.0",
    packageJson: validPackage,
    runCommand: commandRunner({
      "pnpm --version": new Error("ENOENT"),
      "docker --version": new Error("ENOENT"),
      "docker compose version": new Error("ENOENT")
    })
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.lines, [
    "environment not ready",
    "✗ Node.js 24.10.0 does not satisfy 24.18.x",
    "  Run: nvm install && nvm use",
    "✗ pnpm is unavailable; expected pnpm@11.17.0",
    "  Run: npm install --global pnpm@11.17.0",
    "✗ Docker CLI is unavailable",
    "  Install Docker Desktop or another Docker distribution with Compose support.",
    "✗ Docker Compose plugin is unavailable",
    "  Install or enable the Docker Compose plugin."
  ]);
});

test("treats malformed repository version contracts as actionable policy errors", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: {
      engines: { node: ">=24" },
      packageManager: "pnpm@latest"
    },
    runCommand: passingRunner()
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.lines.slice(0, 5), [
    "environment not ready",
    '✗ package.json#engines.node must use "major.minor.x"; received ">=24"',
    "  Set a supported Node.js contract before running repository commands.",
    '✗ package.json#packageManager must use "pnpm@major.minor.patch"; received "pnpm@latest"',
    "  Pin an exact pnpm version before running repository commands."
  ]);
});

test("rejects non-canonical numeric version contracts", async () => {
  const result = await checkEnvironment({
    nodeVersion: "v24.18.0",
    packageJson: {
      engines: { node: "024.18.x" },
      packageManager: "pnpm@011.17.0"
    },
    runCommand: passingRunner({ "pnpm --version": "011.17.0\n" })
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.lines.includes(
      '✗ package.json#engines.node must use "major.minor.x"; received "024.18.x"'
    )
  );
  assert.ok(
    result.lines.includes(
      '✗ package.json#packageManager must use "pnpm@major.minor.patch"; received "pnpm@011.17.0"'
    )
  );
});

test("main writes diagnostic output and returns an executable exit status", async () => {
  const lines = [];
  const exitStatus = await main({
    nodeVersion: "v24.18.3",
    packageJson: validPackage,
    runCommand: passingRunner(),
    databaseUrl:
      "postgresql://meeting_room:meeting_room@localhost:5432/meeting_room",
    writeLine: (line) => lines.push(line)
  });

  assert.equal(exitStatus, 0);
  assert.equal(lines[0], "environment ready");

  const failureLines = [];
  const failureStatus = await main({
    nodeVersion: "v24.17.0",
    packageJson: validPackage,
    runCommand: passingRunner(),
    databaseUrl:
      "postgresql://meeting_room:meeting_room@localhost:5432/meeting_room",
    writeLine: (line) => failureLines.push(line)
  });

  assert.equal(failureStatus, 1);
  assert.equal(failureLines[0], "environment not ready");
});

test("does not require database configuration before pnpm work", async () => {
  const lines = [];
  const exitStatus = await main({
    nodeVersion: "v24.18.0",
    packageJson: validPackage,
    runCommand: passingRunner(),
    databaseUrl: "",
    readEnvFile: async () => "# no database configuration\n",
    writeLine: (line) => lines.push(line)
  });

  assert.equal(exitStatus, 0);
  assert.equal(lines[0], "environment ready");
  assert.ok(!lines.some((line) => line.includes("DATABASE_URL")));
});

test("the production runner uses the Windows command shell for npm shims", async () => {
  const calls = [];
  const runCommand = createCommandRunner({
    execute: async (...args) => {
      calls.push(args);
      return { stdout: "11.17.0\n" };
    },
    platform: "win32",
    commandShell: "C:\\Windows\\System32\\cmd.exe"
  });

  await runCommand("pnpm", ["--version"]);

  assert.deepEqual(calls, [
    ["C:\\Windows\\System32\\cmd.exe", ["/d", "/s", "/c", "pnpm --version"]]
  ]);
});

test("the executable propagates success and failure through its process status", async () => {
  const fakeBin = await mkdtemp(join(tmpdir(), "doctor-bin-"));
  const executable = fileURLToPath(new URL("./doctor.mjs", import.meta.url));
  const path = `${fakeBin}${delimiter}${process.env.PATH}`;
  const commandSuffix = process.platform === "win32" ? ".cmd" : "";
  const pnpmSuccess =
    process.platform === "win32"
      ? "@echo off\r\necho 11.17.0\r\n"
      : "#!/bin/sh\necho 11.17.0\n";
  const pnpmFailure =
    process.platform === "win32"
      ? "@echo off\r\necho 11.16.0\r\n"
      : "#!/bin/sh\necho 11.16.0\n";
  const dockerSuccess =
    process.platform === "win32"
      ? "@echo off\r\nexit /b 0\r\n"
      : "#!/bin/sh\nexit 0\n";

  try {
    await writeFile(join(fakeBin, `pnpm${commandSuffix}`), pnpmSuccess, {
      mode: 0o755
    });
    await writeFile(join(fakeBin, `docker${commandSuffix}`), dockerSuccess, {
      mode: 0o755
    });

    const success = await executeFile(process.execPath, [executable], {
      env: {
        ...process.env,
        PATH: path
      }
    });
    assert.match(success.stdout, /^environment ready/m);

    await writeFile(join(fakeBin, `pnpm${commandSuffix}`), pnpmFailure, {
      mode: 0o755
    });
    await assert.rejects(
      executeFile(process.execPath, [executable], {
        env: {
          ...process.env,
          PATH: path
        }
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /^environment not ready/m);
        assert.match(error.stdout, /pnpm 11\.16\.0 does not satisfy/);
        return true;
      }
    );
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const generatedDirectory = join(root, "apps/api/src/generated/prisma");
const backupDirectory = join(
  root,
  "apps/api/src/generated/prisma.typecheck-backup"
);

test("API typecheck generates the ignored Prisma client", async () => {
  let hasExistingGeneratedDirectory = true;

  try {
    await access(generatedDirectory);
  } catch {
    hasExistingGeneratedDirectory = false;
  }

  if (hasExistingGeneratedDirectory) {
    await rename(generatedDirectory, backupDirectory);
  }

  try {
    await executeFile("pnpm", ["--filter", "@mrb/api", "typecheck"], {
      cwd: root
    });
    await assert.doesNotReject(access(join(generatedDirectory, "client.ts")));
  } finally {
    await rm(generatedDirectory, { recursive: true, force: true });
    if (hasExistingGeneratedDirectory) {
      await rename(backupDirectory, generatedDirectory);
    }
  }
});

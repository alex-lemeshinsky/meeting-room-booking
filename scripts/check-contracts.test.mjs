import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const checkContracts = fileURLToPath(
  new URL("./check-contracts.mjs", import.meta.url)
);

async function writeFixtureFile(root, path, contents) {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, contents);
}

test("rejects stale generated contracts even when they are staged", async () => {
  const root = await mkdtemp(join(tmpdir(), "contract-check-"));
  const bin = await mkdtemp(join(tmpdir(), "contract-check-bin-"));
  const pnpm = join(bin, "pnpm");

  try {
    await writeFixtureFile(root, "apps/api/openapi.json", "original\n");
    await writeFixtureFile(
      root,
      "packages/contracts/src/generated/api.ts",
      "original\n"
    );
    await writeFile(pnpm, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    await executeFile("git", ["init", "--quiet"], { cwd: root });
    await executeFile("git", ["add", "."], { cwd: root });
    await executeFile(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test User",
        "commit",
        "--quiet",
        "-m",
        "fixture"
      ],
      { cwd: root }
    );

    await writeFixtureFile(root, "apps/api/openapi.json", "stale\n");
    await executeFile("git", ["add", "apps/api/openapi.json"], { cwd: root });

    await assert.rejects(
      executeFile(process.execPath, [checkContracts], {
        cwd: root,
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /generated contracts are stale/);
        return true;
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

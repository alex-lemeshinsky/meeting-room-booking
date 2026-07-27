import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  RepositoryPolicyError,
  verifyRepository
} from "./repository-policy.mjs";

const requiredPackages = [
  ["apps/web/package.json", "@mrb/web"],
  ["apps/api/package.json", "@mrb/api"],
  ["packages/time/package.json", "@mrb/time"],
  ["packages/contracts/package.json", "@mrb/contracts"],
  ["packages/config/package.json", "@mrb/config"]
];

const validTrackedFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  ...requiredPackages.map(([path]) => path),
  "apps/web/src/styles/tokens.css",
  "docs/superpowers/README.md",
  "docs/guide.md"
];

const executeFile = promisify(execFile);

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFixtureFile(root, path, contents = "") {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, contents);
}

async function createValidRepository() {
  const root = await mkdtemp(join(tmpdir(), "repository-policy-"));

  await writeJson(join(root, "package.json"), {
    name: "meeting-room-booking",
    private: true,
    type: "module",
    engines: { node: "24.18.x" },
    packageManager: "pnpm@11.17.0",
    scripts: { test: "pnpm test:unit" }
  });
  await writeFixtureFile(
    root,
    "pnpm-workspace.yaml",
    "packages:\n  - apps/*\n  - packages/*\n"
  );

  for (const [path, name] of requiredPackages) {
    await writeJson(join(root, path), {
      name,
      private: true,
      type: "module"
    });
  }

  await writeFixtureFile(root, "apps/web/src/styles/tokens.css");
  await writeFixtureFile(root, "apps/api/src/.gitkeep");
  await writeFixtureFile(root, "docs/superpowers/README.md", "# Task state\n");
  await writeFixtureFile(root, "docs/guide.md", "# Guide\n");

  return root;
}

async function withValidRepository(run) {
  const root = await createValidRepository();

  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function stageFixtureFiles(root) {
  await executeFile("git", ["init", "--quiet"], { cwd: root });
  await executeFile("git", ["add", "--all"], { cwd: root });
}

test("accepts a repository satisfying the workspace contract", async () => {
  await withValidRepository(async (root) => {
    const result = await verifyRepository(root, {
      trackedFiles: validTrackedFiles
    });

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("loads tracked files from Git when none are injected", async () => {
  await withValidRepository(async (root) => {
    await stageFixtureFiles(root);

    const result = await verifyRepository(root);

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("reports every invalid package contract with its path", async () => {
  await withValidRepository(async (root) => {
    await writeJson(join(root, "apps/web/package.json"), {
      name: "wrong",
      private: false,
      type: "commonjs"
    });

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "apps/web/package.json must declare @mrb/web",
          "apps/web/package.json must remain private",
          "apps/web/package.json must use ESM"
        ]);
        return true;
      }
    );
  });
});

test("reports a missing required package manifest with its path", async () => {
  await withValidRepository(async (root) => {
    await rm(join(root, "packages/time/package.json"));

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "packages/time/package.json is required"
        ]);
        return true;
      }
    );
  });
});

test("reports every invalid root runtime and package-manager contract", async () => {
  await withValidRepository(async (root) => {
    await writeJson(join(root, "package.json"), {
      engines: { node: "20.x" },
      packageManager: "pnpm@10.0.0",
      scripts: { test: "node --test" }
    });

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "package.json must require Node 24.18.x",
          "package.json must declare pnpm@11.17.0",
          "package.json must map test to pnpm test:unit"
        ]);
        return true;
      }
    );
  });
});

test("reports missing workspace package discovery globs", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "pnpm-workspace.yaml",
      "packages:\n  - tooling/*\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "pnpm-workspace.yaml must include apps/*",
          "pnpm-workspace.yaml must include packages/*"
        ]);
        return true;
      }
    );
  });
});

test("rejects workspace globs that appear only in comments", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "pnpm-workspace.yaml",
      "packages:\n  - tooling/*\n# apps/* and packages/* are required\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "pnpm-workspace.yaml must include apps/*",
          "pnpm-workspace.yaml must include packages/*"
        ]);
        return true;
      }
    );
  });
});

test("rejects workspace globs that appear only beneath another YAML key", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "pnpm-workspace.yaml",
      "ignored:\n  - apps/*\n  - packages/*\npackages:\n  - tooling/*\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert(error instanceof RepositoryPolicyError);
        assert.deepEqual(error.violations, [
          "pnpm-workspace.yaml must include apps/*",
          "pnpm-workspace.yaml must include packages/*"
        ]);
        return true;
      }
    );
  });
});

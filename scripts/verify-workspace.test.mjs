import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";
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

  await writeFixtureFile(
    root,
    "apps/web/src/styles/tokens.css",
    ":root { --color-text: #172033; }\n"
  );
  await writeFixtureFile(root, "apps/api/src/.gitkeep");
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

test("rejects database coupling and CORS enablement", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "apps/web/src/data.ts",
      'import { PrismaClient } from "@prisma/client";\n' +
        "export const url = process.env.DATABASE_URL;\n"
    );
    await writeFixtureFile(root, "apps/api/src/main.ts", "app.enableCors();\n");

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert.deepEqual(error.violations, [
          "apps/web/src/data.ts must not reference Prisma or database access",
          "apps/web/src/data.ts must not reference DATABASE_URL",
          "apps/api/src/main.ts must not enable browser CORS"
        ]);
        return true;
      }
    );
  });
});

test("enforces web boundaries outside the source directory", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "apps/web/next.config.ts",
      'import { db } from "./database/client";\n' +
        "export const url = process.env.DATABASE_URL;\n"
    );
    await writeFixtureFile(
      root,
      "apps/web/public/theme.css",
      ".theme { color: #abcdef; }\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert.deepEqual(error.violations, [
          "apps/web/next.config.ts must not reference Prisma or database access",
          "apps/web/next.config.ts must not reference DATABASE_URL",
          "apps/web/public/theme.css contains raw color #abcdef; " +
            "define colors in apps/web/src/styles/tokens.css"
        ]);
        return true;
      }
    );
  });
});

test("ignores generated web output when enforcing boundaries", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "apps/web/.next/server/generated.ts",
      "const client = new PrismaClient(process.env.DATABASE_URL);\n"
    );
    await writeFixtureFile(
      root,
      "apps/web/.next/static/generated.css",
      ".generated { color: #abcdef; }\n"
    );

    const result = await verifyRepository(root, {
      trackedFiles: validTrackedFiles
    });

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("rejects raw web colors outside the token file", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "apps/web/src/app/page.module.css",
      ".page { color: #abcdef; }\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert.deepEqual(error.violations, [
          "apps/web/src/app/page.module.css contains raw color #abcdef; " +
            "define colors in apps/web/src/styles/tokens.css"
        ]);
        return true;
      }
    );
  });
});

test("rejects missing and untracked repository Markdown links", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "docs/guide.md",
      "[missing](missing.md)\n" + "[local file](local.md)\n"
    );
    await writeFixtureFile(root, "docs/local.md", "# Local only\n");
    const trackedFiles = [...validTrackedFiles, "docs/guide.md"];

    await assert.rejects(verifyRepository(root, { trackedFiles }), (error) => {
      assert.deepEqual(error.violations, [
        "docs/guide.md links to missing file docs/missing.md",
        "docs/guide.md links to untracked file docs/local.md"
      ]);
      return true;
    });
  });
});

test("rejects missing and untracked reference-style Markdown links", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "docs/guide.md",
      "[missing][missing-ref]\n" +
        "[local file][file]\n\n" +
        "[missing-ref]: missing.md\n" +
        '[file]: local.md "Local file"\n'
    );
    await writeFixtureFile(root, "docs/local.md", "# Local only\n");

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert.deepEqual(error.violations, [
          "docs/guide.md links to missing file docs/missing.md",
          "docs/guide.md links to untracked file docs/local.md"
        ]);
        return true;
      }
    );
  });
});

test("ignores external and same-document Markdown links", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "docs/guide.md",
      "[web](https://example.com)\n[mail](mailto:test@example.com)\n" +
        "[section](#section)\n"
    );
    const result = await verifyRepository(root, {
      trackedFiles: [...validTrackedFiles, "docs/guide.md"]
    });

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("ignores links inside a four-backtick fenced example", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "docs/guide.md",
      "````md\n```md\n[link](missing.md)\n[ref][missing]\n" +
        "[missing]: missing.md\n```\n````\n"
    );

    const result = await verifyRepository(root, {
      trackedFiles: validTrackedFiles
    });

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("rejects direct PrismaClient references in web JSX source", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(
      root,
      "apps/web/src/client.jsx",
      'import { PrismaClient } from "custom-client";\n' +
        "export const client = new PrismaClient();\n"
    );

    await assert.rejects(
      verifyRepository(root, { trackedFiles: validTrackedFiles }),
      (error) => {
        assert.deepEqual(error.violations, [
          "apps/web/src/client.jsx must not reference Prisma or database access"
        ]);
        return true;
      }
    );
  });
});

test("resolves encoded relative paths and file fragments", async () => {
  await withValidRepository(async (root) => {
    await writeFixtureFile(root, "docs/encoded guide.md", "# Encoded\n");
    await writeFixtureFile(root, "docs/target.md", "# Section\n");
    await writeFixtureFile(
      root,
      "docs/guide.md",
      "[encoded](encoded%20guide.md)\n" + "[fragment](target.md#section)\n"
    );

    const result = await verifyRepository(root, {
      trackedFiles: [
        ...validTrackedFiles,
        "docs/encoded guide.md",
        "docs/target.md"
      ]
    });

    assert.deepEqual(result, { packageCount: 5 });
  });
});

test("documents the auth and rooms clean-machine setup", async () => {
  const [envExample, readme] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8")
  ]);

  assert.match(envExample, /^APP_ORIGIN=http:\/\/localhost:3000$/m);
  assert.match(readme, /pnpm db:seed/);
  assert.match(readme, /olena@example\.com/);
  assert.match(readme, /alex@example\.com/);
});

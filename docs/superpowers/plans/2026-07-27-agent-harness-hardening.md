# Agent Harness Hardening Implementation Plan

Status: active

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository task state durable, make agent policies executable,
and provide one canonical fast/full verification workflow locally and in CI.

**Architecture:** A tested, dependency-free Node policy module evaluates
repository fixtures and the real checkout. Thin package scripts compose
focused checks into `verify:fast` and `verify:all`; tracked Superpowers
documents and a task-state index provide durable cross-session state.

**Tech Stack:** Node.js built-in test runner and filesystem APIs, ESLint flat
config, pnpm scripts, Vitest, GitHub Actions, Markdown.

## Global Constraints

- Do not change Node.js or pnpm requirements, runtime activation, or preflight.
- Do not change product behavior or application runtime code.
- Do not add npm dependencies.
- Keep `scripts/verify-workspace.mjs` as the public policy entry point.
- Every executable policy change follows red-green TDD.
- Historical specifications and plans remain available in Git.
- CI remains one job with a 30-minute timeout.
- Commit each task as one coherent verified slice.

---

### Task 1: Establish durable task-state documentation

**Files:**

- Create: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/2026-07-27-agent-harness.md`
- Modify: `docs/superpowers/specs/2026-07-27-agent-harness-design.md`
- Modify: `docs/superpowers/specs/2026-07-27-meeting-room-booking-design.md`
- Modify: `docs/superpowers/plans/2026-07-27-agent-harness-hardening.md`

**Interfaces:**

- Consumes: restored historical artifacts and the approved hardening design.
- Produces: one tracked index and unambiguous `historical`/`active` states.

- [ ] **Step 1: Mark restored documents as historical**

Replace each restored specification's localized
`Статус: затверджено` header with `Status: historical`. Add
`Status: historical` beneath the old agent-harness plan title, followed by:

```markdown
> Historical record. Do not execute this plan; its implementation was
> completed by commit `3d6316c` and later workflow changes superseded it.
```

Do not rewrite the remaining historical body or its original checkboxes.

- [ ] **Step 2: Mark this implementation plan active**

Change:

```markdown
Status: draft
```

to:

```markdown
Status: active
```

- [ ] **Step 3: Create the task-state index**

Create `docs/superpowers/README.md` with these sections:

```markdown
# Superpowers task state

## Active plan

- [Agent Harness Hardening](plans/2026-07-27-agent-harness-hardening.md)
  ([approved design](specs/2026-07-27-agent-harness-hardening-design.md))

## Approved queue

None.

## Historical records

- [Universal Agent Harness plan](plans/2026-07-27-agent-harness.md)
- [Universal Agent Harness design](specs/2026-07-27-agent-harness-design.md)
- [Meeting Room Booking design](specs/2026-07-27-meeting-room-booking-design.md)

## Latest full verification

Foundation verification completed in commit `acca389`; the active hardening
plan will replace this entry with fresh evidence.

## Next smallest product slice

Auth, opaque stateful sessions, email verification, and seeded rooms, subject
to an approved specification and plan.
```

- [ ] **Step 4: Verify and commit task state**

Run:

```bash
git diff --check
git diff -- docs/superpowers
```

Expected: one active plan, no historical plan presented as executable, and no
whitespace errors.

Commit:

```bash
git add docs/superpowers
git commit -m "docs: index durable agent task state"
```

---

### Task 2: Build a testable repository policy core

**Files:**

- Create: `scripts/repository-policy.mjs`
- Modify: `scripts/verify-workspace.mjs`
- Modify: `scripts/verify-workspace.test.mjs`

**Interfaces:**

- Produces:
  `verifyRepository(root, { trackedFiles? }): Promise<{ packageCount: number }>`
  and `RepositoryPolicyError` with a public `violations: string[]`.
- `scripts/verify-workspace.mjs` calls the function for `process.cwd()`, prints
  the package count on success, and prints every violation before exiting `1`.

- [ ] **Step 1: Write failing fixture-based contract tests**

Replace real-checkout assertions with a temporary repository fixture containing
the five required manifests, root manifest, workspace file, empty web/API
source trees, token CSS, tracked task-state index, and tracked Markdown docs.

Add tests with hand-authored expectations:

```js
test("accepts a repository satisfying the workspace contract", async () => {
  const root = await createValidRepository();
  const result = await verifyRepository(root, {
    trackedFiles: validTrackedFiles
  });
  assert.deepEqual(result, { packageCount: 5 });
});

test("reports every invalid package contract with its path", async () => {
  const root = await createValidRepository();
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
```

The production mutations these tests catch are accepting a missing/wrong
package, dropping the private-package requirement, or accepting CommonJS.

- [ ] **Step 2: Run the tests and observe RED**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
```

Expected: FAIL because `scripts/repository-policy.mjs` does not exist.

- [ ] **Step 3: Implement the minimal policy core**

Create `RepositoryPolicyError`, helpers that collect violations without
throwing early, manifest/workspace checks, and optional Git-backed tracked-file
loading when `trackedFiles` is not supplied.

`verifyRepository` must return `{ packageCount: 5 }` or throw one
`RepositoryPolicyError` containing every violation.

Make `scripts/verify-workspace.mjs` a thin executable:

```js
import { verifyRepository } from "./repository-policy.mjs";

try {
  const result = await verifyRepository(process.cwd());
  console.log(`workspace verified: ${result.packageCount} packages`);
} catch (error) {
  if (error?.violations) {
    for (const violation of error.violations) console.error(violation);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
```

- [ ] **Step 4: Run GREEN and the real repository entry point**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
node scripts/verify-workspace.mjs
```

Expected: fixture tests pass and the real repository reports five packages.

- [ ] **Step 5: Commit the policy core**

```bash
git add scripts/repository-policy.mjs scripts/verify-workspace.mjs \
  scripts/verify-workspace.test.mjs
git commit -m "test: make repository policy executable"
```

---

### Task 3: Enforce architecture and documentation boundaries

**Files:**

- Modify: `scripts/repository-policy.mjs`
- Modify: `scripts/verify-workspace.test.mjs`
- Modify: `eslint.config.mjs`

**Interfaces:**

- Extends `verifyRepository` with source, CSS, Markdown-link, Git-tracking, and
  task-index rules while preserving its public result and error shape.
- ESLint rejects web imports from `@prisma/*`, generated Prisma paths, and
  database modules.

- [ ] **Step 1: Write failing architecture-boundary tests**

Add one fixture test per realistic break:

```js
test("rejects database coupling and CORS enablement", async () => {
  const root = await createValidRepository();
  await writeText(
    join(root, "apps/web/src/data.ts"),
    'import { PrismaClient } from "@prisma/client";\n' +
      "export const url = process.env.DATABASE_URL;\n"
  );
  await writeText(join(root, "apps/api/src/main.ts"), "app.enableCors();\n");

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

test("rejects raw web colors outside the token file", async () => {
  const root = await createValidRepository();
  await writeText(
    join(root, "apps/web/src/app/page.module.css"),
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
```

The production mutations caught are removing a forbidden-reference scanner,
limiting it to one extension, or accidentally scanning the approved token file.

- [ ] **Step 2: Run RED, implement source/CSS scanning, and run GREEN**

Run the focused test before and after implementation:

```bash
node --test --test-name-pattern="database coupling|raw web colors" \
  scripts/verify-workspace.test.mjs
```

Expected before: FAIL because violations are not detected. Expected after:
PASS with path-qualified messages.

- [ ] **Step 3: Write failing Markdown and task-state tests**

Add these real-behavior cases:

```js
test("rejects missing and untracked repository Markdown links", async () => {
  const root = await createValidRepository();
  await writeText(
    join(root, "docs/guide.md"),
    "[missing](missing.md)\n" + "[local spec](superpowers/specs/local.md)\n"
  );
  await writeText(
    join(root, "docs/superpowers/specs/local.md"),
    "# Local only\n"
  );
  const trackedFiles = [...validTrackedFiles, "docs/guide.md"];

  await assert.rejects(verifyRepository(root, { trackedFiles }), (error) => {
    assert.deepEqual(error.violations, [
      "docs/guide.md links to missing file docs/missing.md",
      "docs/guide.md links to untracked Superpowers file " +
        "docs/superpowers/specs/local.md"
    ]);
    return true;
  });
});

test("rejects an untracked plan in the task-state index", async () => {
  const root = await createValidRepository();
  await writeText(
    join(root, "docs/superpowers/plans/local.md"),
    "# Local plan\n"
  );
  await writeText(
    join(root, "docs/superpowers/README.md"),
    "[Local plan](plans/local.md)\n"
  );

  await assert.rejects(
    verifyRepository(root, { trackedFiles: validTrackedFiles }),
    (error) => {
      assert.deepEqual(error.violations, [
        "docs/superpowers/README.md links to untracked task-state file " +
          "docs/superpowers/plans/local.md"
      ]);
      return true;
    }
  );
});

test("ignores external and same-document Markdown links", async () => {
  const root = await createValidRepository();
  await writeText(
    join(root, "docs/guide.md"),
    "[web](https://example.com)\n[mail](mailto:test@example.com)\n" +
      "[section](#section)\n"
  );
  const result = await verifyRepository(root, {
    trackedFiles: [...validTrackedFiles, "docs/guide.md"]
  });
  assert.deepEqual(result, { packageCount: 5 });
});
```

- [ ] **Step 4: Run RED, implement link/tracking validation, and run GREEN**

Run:

```bash
node --test --test-name-pattern="Markdown|task-state|untracked" \
  scripts/verify-workspace.test.mjs
```

Expected before: FAIL. Implement relative-link parsing with fragments removed
and URL-decoding applied, then expect all focused tests to pass.

- [ ] **Step 5: Add fast editor feedback through ESLint**

Add a flat-config block for `apps/web/**/*.{js,jsx,ts,tsx}` using
`no-restricted-imports`:

```js
{
  files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@prisma/*", "**/generated/prisma/**", "**/database/**"],
            message: "apps/web must access domain data through the NestJS API."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Verify all policies and commit**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
node scripts/verify-workspace.mjs
node_modules/.bin/eslint .
```

Expected: all harness tests pass, the real repository passes policy, and lint
reports no violations.

Commit:

```bash
git add scripts/repository-policy.mjs scripts/verify-workspace.test.mjs \
  eslint.config.mjs
git commit -m "chore: enforce repository architecture policies"
```

---

### Task 4: Make verification and test discovery canonical

**Files:**

- Modify: `package.json`
- Modify: `apps/api/package.json`

**Interfaces:**

- Produces root commands `test:harness`, `test:unit:workspace`,
  `verify:fast`, and `verify:all`.
- Preserves `npm test` as the assignment-compatible unit entry point.
- API integration discovery filters all files containing
  `integration-spec.ts`.

- [ ] **Step 1: Update integration discovery**

Change:

```json
"test:integration": "vitest run test/health.integration-spec.ts"
```

to:

```json
"test:integration": "vitest run integration-spec.ts"
```

Vitest treats positional filters as path substrings, so every current and
future `*.integration-spec.ts` file is selected.

- [ ] **Step 2: Add canonical root scripts**

Use these script contracts:

```json
"test": "pnpm test:unit",
"test:harness": "node --test scripts/*.test.mjs",
"test:unit": "pnpm test:harness && pnpm test:unit:workspace",
"test:unit:workspace": "pnpm -r --if-present test:unit",
"verify:fast": "pnpm test:harness && pnpm verify:workspace && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit:workspace && pnpm contracts:check && pnpm build",
"verify:all": "pnpm verify:fast && pnpm test:integration && pnpm test:e2e"
```

- [ ] **Step 3: Verify discovery and command composition**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
npm test
pnpm --filter @mrb/api exec vitest list integration-spec.ts
```

Expected: harness tests and workspace unit tests pass; Vitest lists
`test/health.integration-spec.ts`.

- [ ] **Step 4: Commit canonical commands**

```bash
git add package.json apps/api/package.json
git commit -m "chore: canonicalize verification commands"
```

---

### Task 5: Route documentation and CI through canonical gates

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `.github/workflows/ci.yml`
- Modify (formatting only): `docs/superpowers/plans/2026-07-27-agent-harness.md`
- Modify (formatting only):
  `docs/superpowers/plans/2026-07-27-agent-harness-hardening.md`

**Interfaces:**

- Human and agent instructions use `pnpm verify:fast` and `pnpm verify:all`.
- CI runs fast checks before browser installation and preserves E2E failures.

- [ ] **Step 1: Update repository instructions**

Replace duplicated gate lists with:

```text
pnpm verify:fast
pnpm verify:all
```

Document that focused commands remain available, `verify:fast` needs neither
Docker nor a browser, and `verify:all` adds PostgreSQL integration and
Playwright. Explain that contract freshness regeneration can modify generated
files locally.

Point task-state discovery to `docs/superpowers/README.md`.

- [ ] **Step 2: Harden and reorder CI**

Use this workflow structure:

```yaml
permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
      - name: Install pnpm
        uses: pnpm/action-setup@v6
      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24.18.0
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run fast verification
        run: pnpm verify:fast
      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium
      - name: Run PostgreSQL integration tests
        run: pnpm test:integration
      - name: Run browser tests
        run: pnpm test:e2e
      - name: Upload browser diagnostics
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-diagnostics
          path: |
            playwright-report/
            test-results/
          if-no-files-found: ignore
          retention-days: 7
```

`pnpm/action-setup` reads the exact version from root `packageManager`.

- [ ] **Step 3: Verify documentation, workflow, and policy**

Run Prettier in write mode on the two restored plan files that became visible
to the repository formatter when `docs/superpowers` returned to version
control. Preserve every word, lifecycle marker, and checkbox; only
Prettier-generated whitespace and line wrapping may change.

Run:

```bash
node scripts/verify-workspace.mjs
node_modules/.bin/prettier --check AGENTS.md README.md docs/architecture.md \
  docs/superpowers .github/workflows/ci.yml
git diff --check
git diff -- AGENTS.md README.md docs/architecture.md .github/workflows/ci.yml
```

Expected: policy and formatting pass; the diff contains no runtime activation
or product behavior changes.

- [ ] **Step 4: Commit the routed workflow**

```bash
git add AGENTS.md README.md docs/architecture.md .github/workflows/ci.yml
git commit -m "ci: route checks through canonical verification"
```

---

### Task 6: Run final gates and record durable evidence

**Files:**

- Modify: `docs/superpowers/README.md`
- Modify: `docs/superpowers/plans/2026-07-27-agent-harness-hardening.md`

**Interfaces:**

- Completes the task lifecycle with exact verification evidence and the next
  product slice.

- [ ] **Step 1: Run the complete harness and fast gate**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
pnpm verify:fast
```

Record test counts, exit status, and any unavailable environmental check.

- [ ] **Step 2: Run environment-dependent gates**

Run:

```bash
pnpm test:integration
pnpm test:e2e
```

Expected: the PostgreSQL Testcontainer test and both Playwright foundation
tests pass. If infrastructure is unavailable, record the exact failure and do
not claim `verify:all` passed.

- [ ] **Step 3: Review repository state**

Run:

```bash
git diff --check
git status --short
git diff HEAD~5 --stat
git diff HEAD~5 -- . ':!pnpm-lock.yaml'
```

Confirm no runtime/preflight change, no unrelated file, no generated artifact,
and no unresolved acceptance criterion.

- [ ] **Step 4: Complete plan and task-state index**

Change this plan to `Status: complete`, check every completed step, and add a
`## Verification evidence` section containing exact command results. Update
`docs/superpowers/README.md` so:

- active plan is `None`;
- this plan and design appear under completed records;
- latest full verification points to the final evidence;
- next smallest product slice remains auth/sessions/seeded rooms.

- [ ] **Step 5: Verify and commit the handoff**

Run:

```bash
node scripts/verify-workspace.mjs
git diff --check
git diff -- docs/superpowers
```

Commit:

```bash
git add docs/superpowers
git commit -m "docs: complete agent harness hardening"
```

## Plan self-review

- [x] Every requirement in the approved specification maps to a task.
- [x] Runtime activation and preflight are explicitly excluded.
- [x] Every new executable policy is introduced through a failing test.
- [x] Public function names and error shapes are consistent across tasks.
- [x] CI uses current supported action majors: checkout v7, setup-node v7,
      pnpm/action-setup v6, and upload-artifact v7.
- [x] No implementation step contains a placeholder or delegates unspecified
      error handling.
- [x] Each task ends with focused evidence and a coherent commit.

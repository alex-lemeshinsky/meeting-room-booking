# Meeting Room Booking — Agent Harness Hardening Design

Date: 2026-07-27
Status: approved

## 1. Goal

Make the repository's agent workflow durable, mechanically enforced, and
efficient to run. A clean clone must contain the approved specifications,
implementation plans, task state, and executable quality gates needed to
continue work without relying on one developer's local files.

## 2. Scope

This change covers:

- restoring all existing `docs/superpowers` specifications and plans to Git;
- defining an explicit lifecycle and index for specifications and plans;
- making unit, harness, and integration test discovery comprehensive;
- replacing duplicated gate lists with canonical `verify:fast` and
  `verify:all` commands;
- mechanically enforcing stable repository and architecture boundaries;
- improving CI ordering, cancellation, permissions, caching, and failure
  diagnostics;
- updating `AGENTS.md`, `README.md`, and architecture documentation to use the
  canonical workflow.

## 3. Non-goals

- Do not change the Node.js or pnpm requirements, runtime activation, or
  environment preflight workflow.
- Do not implement product features or change application behavior.
- Do not introduce a new lint, dependency-graph, Markdown-link, or task
  management dependency.
- Do not split the current single CI job unless measurement later proves that
  job-level parallelism is worthwhile.
- Do not rewrite historical product or architecture decisions.

## 4. Durable specifications and plans

`docs/superpowers` is repository-owned documentation and must not be ignored.
All existing specifications and plans are restored to Git.

Add `docs/superpowers/README.md` as the task-state index. It records:

- the active implementation plan, or `none`;
- approved plans that have not started;
- completed or historical specifications and plans;
- the most recent full verification evidence;
- the next smallest product slice.

Every new specification and plan has a top-level `Status` field. Supported
values are:

```text
draft
approved
active
complete
superseded
historical
```

Plans also keep checkbox progress and a final evidence section. A completed
plan must not retain unchecked execution steps. Historical documents that
predate the lifecycle convention may use `Status: historical` and retain their
original body unchanged.

## 5. Canonical verification interface

The root package exposes two canonical commands:

```text
pnpm verify:fast
pnpm verify:all
```

`verify:fast` runs deterministic checks that do not require Docker or a
browser:

1. harness tests;
2. workspace and architecture policy checks;
3. formatting;
4. lint;
5. type checking;
6. unit and component tests;
7. generated contract freshness;
8. production builds.

`verify:all` runs `verify:fast`, PostgreSQL integration tests, and Playwright
E2E tests.

Existing focused commands remain available for development. `AGENTS.md`,
`README.md`, and CI refer to the canonical commands instead of maintaining
different ordered lists.

## 6. Test discovery

The root unit command includes repository harness regression tests in addition
to workspace package tests.

The API integration command discovers every file matching
`**/*.integration-spec.ts`. Adding a new integration test must not require
editing `apps/api/package.json`.

Harness regression tests use Node's built-in test runner. Tests invoke policy
logic against temporary fixtures where practical, so a failing rule identifies
the exact file and violated invariant.

## 7. Mechanical policy enforcement

Keep `scripts/verify-workspace.mjs` as the executable repository policy entry
point, backed by focused tests. It verifies:

- required workspace package identities and ESM/private status;
- the pinned root runtime and package manager contract;
- workspace package discovery;
- no Prisma, database, or `DATABASE_URL` references in `apps/web`;
- no browser CORS enablement;
- no raw hexadecimal colors in web CSS outside
  `apps/web/src/styles/tokens.css`;
- every tracked Markdown link to a repository-relative file resolves;
- every `docs/superpowers` file referenced by tracked documentation is itself
  tracked;
- the Superpowers task-state index names only existing tracked files.

ESLint adds narrowly scoped import restrictions for `apps/web` so database
coupling fails during normal editor and lint feedback. Repository-wide
relationship checks stay in the Node policy script because they depend on Git
and cross-file state.

Policy failures must print the violated rule and affected path. No check may
silently rewrite repository files.

## 8. CI workflow

The GitHub Actions workflow remains one verification job and:

- declares `permissions: contents: read`;
- cancels superseded runs for the same workflow and ref;
- installs the pinned pnpm version before enabling pnpm caching;
- uses setup-node's pnpm cache with `pnpm-lock.yaml` as the dependency path;
- runs `pnpm verify:fast` before installing Playwright browser dependencies;
- installs Chromium only after fast checks pass;
- runs integration tests, then E2E tests;
- uploads Playwright reports and test results when E2E fails;
- retains the existing 30-minute timeout.

GitHub-authored actions use their supported major tags. Introducing immutable
commit pins may be handled later together with automated update tooling; manual
SHA maintenance is outside this slice.

## 9. Error handling and developer feedback

Canonical commands stop on the first failed stage and preserve the focused
command names needed for debugging. CI step names mirror those stages.

Generated contract freshness remains a check, but its behavior must be
documented because regeneration can update generated working-tree files during
local execution.

If Docker or Chromium is unavailable, `verify:fast` remains a complete
non-environmental gate; the handoff must explicitly report `verify:all` as
unverified.

## 10. Testing strategy

Use test-driven development for executable harness behavior:

1. add or change one harness regression test;
2. run it and observe the expected failure;
3. implement the smallest policy or script change;
4. rerun the focused test and observe it pass;
5. run the complete harness test suite.

Configuration-only CI and documentation changes are verified with parsing,
repository policy tests, formatting, `git diff --check`, and a complete diff
review.

Final evidence must include:

- harness test count and result;
- `pnpm verify:fast`;
- `pnpm test:integration`;
- `pnpm test:e2e`;
- `git diff --check`;
- final `git status --short`.

## 11. Acceptance criteria

The hardening slice is complete when:

1. a clean clone contains every referenced specification, plan, and task-state
   index;
2. no completed historical task appears active or executable;
3. adding a new integration spec automatically includes it in
   `pnpm test:integration`;
4. harness regression tests run through the root unit workflow and CI;
5. `AGENTS.md`, `README.md`, and CI delegate to the same canonical gates;
6. violations of the listed architecture and documentation rules fail with
   actionable paths;
7. cheap CI gates run before Playwright installation;
8. failed E2E runs retain browser diagnostics;
9. item 5 from the preceding audit—runtime activation and preflight—is not
   modified;
10. the implementation is delivered as small coherent commits with recorded
    verification evidence.

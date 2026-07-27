# Meeting Room Booking — Agent Environment Preflight Design

Date: 2026-07-27
Status: complete

## 1. Goal

Give agents and developers one dependency-free command that diagnoses local
prerequisite drift before pnpm installation or repository verification. The
command must explain every detected problem and exit unsuccessfully when the
environment cannot run the supported workflow.

## 2. Scope

Add:

```text
npm run doctor
```

The command checks:

- the current Node.js version against `package.json#engines.node`;
- the installed pnpm version against `package.json#packageManager`;
- availability of the Docker CLI;
- availability of the Docker Compose plugin.

The command runs before `pnpm install`, uses only Node.js built-ins, does not
require `node_modules`, and does not contact a registry or start Docker.

## 3. Non-goals

- Do not install, activate, or update Node.js, pnpm, Docker, or Compose.
- Do not require Volta, mise, nvm, Homebrew, or another environment manager.
- Do not check Docker daemon health, pull images, start containers, or bind
  ports.
- Do not validate `.env`, database connectivity, browsers, or application
  dependencies.
- Do not add the doctor to `verify:fast` or `verify:all`.
- Do not add npm dependencies.

## 4. Command interface

Add the root script:

```json
"doctor": "node scripts/doctor.mjs"
```

`scripts/doctor.mjs` reads the repository's root `package.json` and delegates
evaluation to a testable module.

Successful output lists every prerequisite:

```text
environment ready
✓ Node.js 24.18.0 satisfies 24.18.x
✓ pnpm 11.17.0 satisfies pnpm@11.17.0
✓ Docker CLI is available
✓ Docker Compose plugin is available
```

Failure output reports every check rather than stopping at the first:

```text
environment not ready
✗ Node.js 24.10.0 does not satisfy 24.18.x
  Run: nvm install && nvm use
✗ pnpm is unavailable; expected pnpm@11.17.0
  Run: npm install --global pnpm@11.17.0
✗ Docker CLI is unavailable
  Install Docker Desktop or another Docker distribution with Compose support.
✗ Docker Compose plugin is unavailable
  Install or enable the Docker Compose plugin.
```

Exit status is `0` only when all checks pass and `1` otherwise.

## 5. Version rules

The doctor derives expected versions from `package.json`; it does not repeat
them as implementation constants.

The currently approved Node expression is `24.18.x`. The preflight supports
the repository's exact `major.minor.x` form and accepts any patch with matching
major and minor numbers.

The pnpm requirement uses the exact `pnpm@major.minor.patch` value in
`packageManager`. Any different installed version fails.

Unsupported or malformed repository version expressions are policy errors with
actionable messages; they must not be treated as successful checks.

## 6. Tool probing

Tool execution is injected behind a small interface so tests do not depend on
the developer's actual machine.

Production probes use:

```text
pnpm --version
docker --version
docker compose version
```

Only command availability and a successful version invocation are required.
The doctor does not parse or constrain Docker/Compose versions.

Missing commands, nonzero exits, spawn errors, and empty pnpm output become
failed checks. Diagnostic output must not expose environment variables or
other secrets.

## 7. File boundaries

Create:

- `scripts/environment-preflight.mjs` — pure evaluation and injected tool
  probing;
- `scripts/doctor.mjs` — thin executable wrapper;
- `scripts/doctor.test.mjs` — Node built-in regression tests.

Modify:

- `package.json` — `doctor` script;
- `README.md` — activation/install order and troubleshooting;
- `AGENTS.md` — run doctor before pnpm commands when orienting in a fresh
  environment;
- `docs/architecture.md` — keep the canonical CI gate sequence current;
- `.github/workflows/ci.yml` — run doctor after Node/pnpm setup and before
  dependency installation;
- `docs/superpowers/README.md` — active/completed lifecycle and latest
  verification evidence;
- this specification — inline implementation evidence.

## 8. Testing strategy

Use red-green TDD with injected tool results. Tests cover:

- all supported prerequisites passing;
- Node major mismatch, minor mismatch, and accepted patch variation;
- missing and wrong-version pnpm;
- missing Docker CLI;
- missing Compose plugin;
- multiple failures reported together in deterministic order;
- malformed root version contracts;
- executable exit status and output using injected dependencies.

Tests assert returned status and diagnostic lines, not mocks or source text.
No test invokes the real Docker daemon.

## 9. Documentation and CI

README setup order becomes:

1. activate Node using the checked-in `.nvmrc` or an equivalent manager;
2. install the pinned pnpm version;
3. run `npm run doctor`;
4. install dependencies;
5. continue with environment and infrastructure setup.

Agents use the same command instead of inferring whether a pnpm failure comes
from code or prerequisite drift.

CI runs `npm run doctor` after `pnpm/action-setup` and `actions/setup-node`,
but before `pnpm install --frozen-lockfile`. This proves the command works in a
clean environment and keeps dependency installation behind the prerequisite
gate.

## 10. Acceptance criteria

The slice is complete when:

1. `npm run doctor` works without `node_modules`;
2. it checks Node, pnpm, Docker CLI, and Compose without starting services;
3. it reports all failures with actionable remediation and exits `1`;
4. supported environments produce four passing checks and exit `0`;
5. expectations come from `package.json`;
6. regression tests run through the existing root harness test discovery;
7. README and AGENTS route fresh-environment setup through the doctor;
8. CI runs the doctor before dependency installation;
9. no dependency, product behavior, runtime requirement, or canonical
   verification composition changes;
10. fresh `pnpm verify:all` evidence is recorded after implementation.

## 11. Implementation evidence

Implemented inline in the existing agent-harness worktree at the user's
direction; no separate implementation plan was created.

The implementation derives both version contracts from `package.json`, probes
tools through an injected command boundary, aggregates results in prerequisite
order, and uses only Node.js built-ins. The wrapper exposes its exit status for
regression tests while remaining directly executable through `npm run doctor`.
On Windows, the production runner invokes npm's `.cmd` shims through the
platform command shell.

Verification on 2026-07-27 with Node.js `v24.18.0`:

- `node --test scripts/doctor.test.mjs`: 12 tests passed;
- `pnpm test:harness`: 33 tests passed;
- `npm run doctor`: Node.js, pnpm, Docker CLI, and Docker Compose passed;
- `pnpm verify:fast`: passed;
- `pnpm verify:all`: passed, including the 1-test PostgreSQL integration gate
  and both Playwright foundation tests;
- `git diff --check`: passed.

The first full verification attempt correctly stopped when Docker Desktop was
not running. After starting the installed runtime and exposing its CLI on
`PATH`, the fresh doctor and complete canonical gate passed.

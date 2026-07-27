# Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible pnpm monorepo foundation with a Next.js web app,
a separate NestJS API, PostgreSQL/Prisma connectivity, generated OpenAPI
contracts, ClearSpace tokens, automated tests, CI, and runnable setup
documentation.

**Architecture:** The browser talks to same-origin `/api/*`; during local
development Next.js rewrites that path to the NestJS process, while nginx will
become the production same-origin proxy in the later infrastructure slice.
NestJS owns API behavior and database access. PostgreSQL is the source of truth,
Prisma owns migrations, and public TypeScript contracts are generated from the
NestJS OpenAPI document.

**Tech Stack:** Node.js `24.18.0` LTS, pnpm `11.17.0`, TypeScript `5.9.3`,
Next.js `16.2.12`, React `19.2.8`, NestJS `11.1.28`, Prisma ORM `7.8.0`,
PostgreSQL `18.4`, Vitest `4`, Playwright `1.62`, Testcontainers Node `12.0.4`.

## Global Constraints

- Keep the repository a pnpm workspace with `apps/web`, `apps/api`, and
  `packages/*`.
- Use ESM packages and strict TypeScript.
- Do not put Prisma, database access, or domain rules in `apps/web`.
- Do not add browser CORS; local browser calls use same-origin `/api/*`.
- Keep UI components in `apps/web`; do not create a shared UI package.
- Use ClearSpace semantic CSS custom properties; raw hex values belong only in
  the token definition file.
- Keep the first UI light-only; dark mode is outside this slice.
- Do not add a calendar widget or calendar feature code in this slice.
- Store instants in UTC and expose time through the `Clock` interface.
- Use PostgreSQL `18.4`, including the security fixes shipped after `18.3`.
- Use Prisma ORM 7's `prisma-client` generator, explicit output path,
  `prisma.config.ts`, and the `@prisma/adapter-pg` driver adapter.
- Do not create domain tables in this slice. The initial migration enables
  `btree_gist`; feature migrations add tables when their contracts are ready.
- `npm test` must run the root unit-test command required by the assignment.
- Every task ends with its focused verification and a coherent commit.
- Do not weaken a check or commit generated secrets, `.env`, coverage, build
  output, Playwright artifacts, or generated Prisma client code.

## Source References

- Product scope: `docs/features.md`, especially `Етап 0. Основа проєкту`.
- Technical boundaries: `docs/architecture.md`.
- Visual contract: `docs/design-system.md`.
- Repository workflow: `AGENTS.md`.
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Next.js installation and current lint behavior](https://nextjs.org/docs/app/getting-started/installation)
- [NestJS 11 migration requirements](https://docs.nestjs.com/migration-guide)
- [Prisma ORM 7 upgrade contract](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma with NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs)
- [PostgreSQL supported versions](https://www.postgresql.org/support/versioning/)
- [Playwright release notes](https://playwright.dev/docs/release-notes)

---

## Planned File Structure

```text
.github/
  workflows/
    ci.yml                         # push/PR verification pipeline
apps/
  api/
    package.json                   # NestJS scripts and dependencies
    tsconfig.json                  # Node/Nest TypeScript config
    vitest.config.ts               # API unit and smoke-test config
    src/
      app.module.ts                # root NestJS module
      bootstrap.ts                 # createApp() used by runtime and tests
      main.ts                      # process entry point
      generated/prisma/            # ignored generated Prisma client
      database/
        database.module.ts         # global Prisma boundary
        database.service.ts        # Prisma client lifecycle
      health/
        health.controller.ts       # live and ready endpoints
        health.module.ts           # health composition
        health.service.ts          # readiness policy
      openapi/
        openapi.ts                 # OpenAPI document builder
    scripts/
      generate-openapi.ts          # writes apps/api/openapi.json
    test/
      setup.ts                       # safe non-connecting unit-test env
      health.smoke-spec.ts         # full Nest app liveness test
      health.integration-spec.ts   # Testcontainers PostgreSQL readiness test
      openapi.spec.ts              # public-path contract test
    openapi.json                   # committed OpenAPI source artifact
  web/
    package.json                   # Next.js scripts and dependencies
    next.config.ts                 # local same-origin API rewrite
    tsconfig.json                  # Next.js TypeScript config
    vitest.config.ts               # jsdom component-test config
    src/
      app/
        globals.css                # imports tokens and global reset
        layout.tsx                 # Manrope/Inter root layout
        page.module.css            # foundation page styles
        page.tsx                   # accessible foundation landing page
        page.spec.tsx              # component smoke test
      styles/
        tokens.css                 # ClearSpace semantic tokens
packages/
  config/
    package.json                   # shared config package
    tsconfig.base.json             # strict shared compiler options
    tsconfig.node.json             # Node ESM extension
    tsconfig.next.json             # Next.js extension
  contracts/
    package.json                   # generated public API contract package
    src/
      generated/api.ts             # generated by openapi-typescript
      index.ts                     # stable package export
  time/
    package.json                   # framework-free time package
    tsconfig.json                  # package build config
    vitest.config.ts               # unit-test config
    src/
      clock.ts                     # Clock, SystemClock, FixedClock
      clock.spec.ts                # clock contract tests
      index.ts                     # public exports
prisma/
  migrations/
    20260727000000_foundation/
      migration.sql                # enables btree_gist
    migration_lock.toml            # PostgreSQL migration provider
  schema.prisma                    # generator and PostgreSQL datasource
scripts/
  check-contracts.mjs              # generated-contract freshness check
  verify-workspace.mjs             # structural/version harness
  verify-workspace.test.mjs        # built-in Node regression test
e2e/
  foundation.spec.ts               # desktop/mobile and API proxy smoke
.editorconfig
.env.example
.gitignore
.npmrc
.nvmrc
compose.dev.yaml                   # local PostgreSQL only
eslint.config.mjs
package.json
playwright.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
prettier.config.mjs
prisma.config.ts
README.md
```

Generated Prisma client files under `apps/api/src/generated/prisma/` are not
committed. `apps/api/openapi.json` and
`packages/contracts/src/generated/api.ts` are committed and checked for
freshness because they are public build inputs.

---

### Task 1: Pin the toolchain and create the workspace harness

**Files:**

- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/config/tsconfig.node.json`
- Create: `packages/config/tsconfig.next.json`
- Create: `scripts/verify-workspace.mjs`
- Create: `scripts/verify-workspace.test.mjs`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `packages/time/package.json`
- Create: `packages/contracts/package.json`
- Generate: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Node.js `24.18.0`, pnpm `11.17.0`.
- Produces: workspace packages `@mrb/web`, `@mrb/api`, `@mrb/time`,
  `@mrb/contracts`, and `@mrb/config`; root quality scripts used by every later
  task.

- [ ] **Step 1: Write the failing workspace regression test**

```js
// scripts/verify-workspace.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace pins the approved runtime and package manager", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(root.engines.node, "24.18.x");
  assert.equal(root.packageManager, "pnpm@11.17.0");
  assert.equal(root.scripts.test, "pnpm test:unit");
});

test("workspace declares every architectural package", async () => {
  const workspace = await readFile("pnpm-workspace.yaml", "utf8");

  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
});
```

- [ ] **Step 2: Run the test and confirm the missing harness fails**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
```

Expected: FAIL because `package.json` and `pnpm-workspace.yaml` do not exist.

- [ ] **Step 3: Create the root package contract**

```json
{
  "name": "meeting-room-booking",
  "private": true,
  "type": "module",
  "engines": {
    "node": "24.18.x"
  },
  "packageManager": "pnpm@11.17.0",
  "scripts": {
    "dev": "pnpm --parallel --filter @mrb/api --filter @mrb/web dev",
    "dev:infra": "docker compose -f compose.dev.yaml up -d postgres",
    "build": "pnpm -r --if-present build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm test:unit",
    "test:unit": "pnpm -r --if-present test:unit",
    "test:integration": "pnpm --filter @mrb/api test:integration",
    "test:e2e": "playwright test",
    "contracts:generate": "pnpm --filter @mrb/api openapi:generate && pnpm --filter @mrb/contracts generate",
    "contracts:check": "node scripts/check-contracts.mjs",
    "verify:workspace": "node scripts/verify-workspace.mjs"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `.nvmrc`:

```text
24.18.0
```

Create `.npmrc`:

```ini
engine-strict=true
save-exact=true
strict-peer-dependencies=true
```

- [ ] **Step 4: Create shared strict TypeScript configuration**

```json
// packages/config/tsconfig.base.json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "allowJs": false,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2023"
  }
}
```

```json
// packages/config/tsconfig.node.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "sourceMap": true
  }
}
```

```json
// packages/config/tsconfig.next.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "incremental": true,
    "jsx": "preserve",
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  }
}
```

Create the repository-wide formatting files:

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true
```

```js
// prettier.config.mjs
export default {
  endOfLine: "lf",
  semi: true,
  singleQuote: false,
  trailingComma: "none"
};
```

```js
// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/generated/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
```

Create the initial `.gitignore`:

```gitignore
.env
.next/
coverage/
dist/
node_modules/
playwright-report/
test-results/
*.tsbuildinfo
```

- [ ] **Step 5: Add package identities and verification implementation**

Each workspace `package.json` must be private, ESM, and expose only scripts
that already work in that task. Implement `scripts/verify-workspace.mjs` so it:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expected = new Map([
  ["apps/web/package.json", "@mrb/web"],
  ["apps/api/package.json", "@mrb/api"],
  ["packages/time/package.json", "@mrb/time"],
  ["packages/contracts/package.json", "@mrb/contracts"],
  ["packages/config/package.json", "@mrb/config"]
]);

for (const [path, name] of expected) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(manifest.name, name, `${path} must declare ${name}`);
  assert.equal(manifest.private, true, `${path} must remain private`);
  assert.equal(manifest.type, "module", `${path} must use ESM`);
}

console.log(`workspace verified: ${expected.size} packages`);
```

- [ ] **Step 6: Install the approved toolchain dependencies**

Run:

```bash
pnpm add -Dw --save-exact \
  typescript@5.9.3 \
  eslint@9 \
  @eslint/js@9 \
  typescript-eslint@8 \
  prettier@3 \
  vitest@4
```

Add framework packages in later tasks, where their need is proven. Do not
install Tailwind, a component kit, a calendar library, or a monorepo
orchestrator.

- [ ] **Step 7: Run the workspace checks**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
pnpm verify:workspace
pnpm format:check
```

Expected:

```text
workspace pins the approved runtime and package manager ... ok
workspace declares every architectural package ... ok
workspace verified: 5 packages
```

- [ ] **Step 8: Commit the workspace foundation**

```bash
git add .editorconfig .gitignore .npmrc .nvmrc package.json \
  pnpm-workspace.yaml pnpm-lock.yaml eslint.config.mjs \
  prettier.config.mjs packages/config apps/web/package.json \
  apps/api/package.json packages/time/package.json \
  packages/contracts/package.json scripts/verify-workspace.mjs \
  scripts/verify-workspace.test.mjs
git commit -m "chore: initialize pnpm workspace"
```

---

### Task 2: Establish the shared Clock boundary

**Files:**

- Create: `packages/time/tsconfig.json`
- Create: `packages/time/vitest.config.ts`
- Create: `packages/time/src/clock.ts`
- Create: `packages/time/src/clock.spec.ts`
- Create: `packages/time/src/index.ts`
- Modify: `packages/time/package.json`

**Interfaces:**

- Consumes: shared Node TypeScript config from Task 1.
- Produces:
  `CLOCK`, `Clock.now(): Date`, `SystemClock`, and
  `FixedClock.set(instant: Date): void`.

- [ ] **Step 1: Write the failing clock contract tests**

```ts
// packages/time/src/clock.spec.ts
import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "./clock.js";

describe("Clock", () => {
  it("returns a defensive copy from FixedClock", () => {
    const source = new Date("2026-07-27T10:00:00.000Z");
    const clock = new FixedClock(source);

    const first = clock.now();
    first.setUTCFullYear(2030);

    expect(clock.now().toISOString()).toBe("2026-07-27T10:00:00.000Z");
  });

  it("allows tests to move FixedClock explicitly", () => {
    const clock = new FixedClock(new Date("2026-07-27T10:00:00.000Z"));
    clock.set(new Date("2026-07-27T10:30:00.000Z"));

    expect(clock.now().toISOString()).toBe("2026-07-27T10:30:00.000Z");
  });

  it("returns the current instant from SystemClock", () => {
    const before = Date.now();
    const result = new SystemClock().now().getTime();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
pnpm --filter @mrb/time test:unit
```

Expected: FAIL because `clock.ts` does not exist.

- [ ] **Step 3: Implement the minimal clock boundary**

```ts
// packages/time/src/clock.ts
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("Clock");

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  readonly #state: { instant: Date };

  constructor(instant: Date) {
    this.#state = { instant: new Date(instant) };
  }

  now(): Date {
    return new Date(this.#state.instant);
  }

  set(instant: Date): void {
    this.#state.instant = new Date(instant);
  }
}
```

```ts
// packages/time/src/index.ts
export { CLOCK, FixedClock, SystemClock, type Clock } from "./clock.js";
```

- [ ] **Step 4: Configure the package**

`packages/time/package.json` must expose `./src/index.ts` to workspace
consumers and define:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "test:unit": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [ ] **Step 5: Run the package and root gates**

Run:

```bash
pnpm --filter @mrb/time test:unit
pnpm --filter @mrb/time typecheck
npm test
```

Expected: three clock tests pass and `npm test` exits `0`.

- [ ] **Step 6: Commit the time boundary**

```bash
git add packages/time
git commit -m "feat: add injectable clock boundary"
```

---

### Task 3: Create the NestJS API and liveness endpoint

**Files:**

- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/bootstrap.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.service.ts`
- Create: `apps/api/test/health.smoke-spec.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `SystemClock` from `@mrb/time`.
- Produces:
  `createApp(): Promise<INestApplication>` and
  `GET /api/v1/health/live -> { status: "ok", now: UTC ISO string }`.

- [ ] **Step 1: Write the failing full-app smoke test**

```ts
// apps/api/test/health.smoke-spec.ts
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/bootstrap.js";

describe("GET /api/v1/health/live", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports process liveness without touching the database", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health/live")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(new Date(response.body.now).toISOString()).toBe(response.body.now);
  });
});
```

- [ ] **Step 2: Run the smoke test and verify red**

Run:

```bash
pnpm --filter @mrb/api test:unit
```

Expected: FAIL because `createApp` does not exist.

- [ ] **Step 3: Install NestJS 11 dependencies**

Run:

```bash
pnpm --filter @mrb/api add --save-exact \
  @nestjs/common@11.1.28 \
  @nestjs/core@11.1.28 \
  @nestjs/platform-express@11.1.28 \
  @nestjs/config@4 \
  reflect-metadata@0.2.2 \
  rxjs@7
pnpm --filter @mrb/api add -D --save-exact \
  @nestjs/cli@11.0.10 \
  @nestjs/testing@11.1.28 \
  @types/node@24 \
  @types/supertest@6 \
  supertest@7 \
  tsx@4
pnpm --filter @mrb/api add @mrb/time@workspace:*
```

- [ ] **Step 4: Implement the app factory and liveness policy**

```ts
// apps/api/src/bootstrap.ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  return app;
}
```

```ts
// apps/api/src/health/health.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "@mrb/time";

@Injectable()
export class HealthService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  live(): { status: "ok"; now: string } {
    return { status: "ok", now: this.clock.now().toISOString() };
  }
}
```

```ts
// apps/api/src/health/health.controller.ts
import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  live(): { status: "ok"; now: string } {
    return this.health.live();
  }
}
```

`main.ts` must call `createApp()`, listen on
`Number(process.env.PORT ?? 3001)`, and bind `0.0.0.0`.

`AppModule` loads configuration and the health boundary:

```ts
// apps/api/src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule]
})
export class AppModule {}
```

`HealthModule` owns the Nest adapter for `Clock`:

```ts
// apps/api/src/health/health.module.ts
import { Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "@mrb/time";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: CLOCK, useClass: SystemClock }
  ]
})
export class HealthModule {}
```

- [ ] **Step 5: Add API scripts and compile settings**

Use `experimentalDecorators`, `emitDecoratorMetadata`, and NodeNext module
resolution. Configure `apps/api/vitest.config.ts` with
`setupFiles: ["./test/setup.ts"]`, and create:

```ts
// apps/api/test/setup.ts
process.env.DATABASE_URL ??=
  "postgresql://meeting_room:meeting_room@127.0.0.1:5432/meeting_room";
```

This value lets liveness and OpenAPI tests construct Prisma after Task 4
without opening a connection. Only the Testcontainers test calls readiness.

Add:

```json
{
  "scripts": {
    "build": "nest build",
    "dev": "tsx watch src/main.ts",
    "lint": "eslint src test",
    "start": "node dist/main.js",
    "test:unit": "vitest run --exclude '**/*.integration-spec.ts'",
    "test:integration": "vitest run test/health.integration-spec.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [ ] **Step 6: Run the API gates**

Run:

```bash
pnpm --filter @mrb/api test:unit
pnpm --filter @mrb/api typecheck
pnpm --filter @mrb/api build
```

Expected: the liveness smoke test passes and the API compiles.

- [ ] **Step 7: Commit the API skeleton**

```bash
git add apps/api packages/time/package.json pnpm-lock.yaml
git commit -m "feat: add NestJS liveness API"
```

---

### Task 4: Add Prisma, PostgreSQL migration, and readiness integration

**Files:**

- Create: `.env.example`
- Create: `prisma.config.ts`
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727000000_foundation/migration.sql`
- Create: `prisma/migrations/migration_lock.toml`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.service.ts`
- Create: `apps/api/test/health.integration-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/src/health/health.service.ts`
- Modify: `apps/api/package.json`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `createApp()` from Task 3 and `DATABASE_URL`.
- Produces:
  `DatabaseService extends PrismaClient`,
  `HealthService.ready(): Promise<{ status: "ok"; database: "up" }>`, and
  `GET /api/v1/health/ready`.

- [ ] **Step 1: Write the failing PostgreSQL integration test**

```ts
// apps/api/test/health.integration-spec.ts
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import request from "supertest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createApp } from "../src/bootstrap.js";

describe("GET /api/v1/health/ready", () => {
  let app: INestApplication;
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:18.4-alpine").start();
    process.env.DATABASE_URL = postgres.getConnectionUri();

    const migration = spawnSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      {
        cwd: resolve(import.meta.dirname, "../../.."),
        env: process.env,
        encoding: "utf8"
      }
    );
    expect(migration.status, migration.stderr).toBe(0);

    app = await createApp();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it("proves the full Nest app can query migrated PostgreSQL", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(200)
      .expect({ status: "ok", database: "up" });
  });
});
```

- [ ] **Step 2: Run the integration test and verify red**

Run:

```bash
pnpm --filter @mrb/api test:integration
```

Expected: FAIL because Prisma, the migration, and `health/ready` do not exist.

- [ ] **Step 3: Install Prisma ORM 7 and Testcontainers**

Run:

```bash
pnpm add -Dw --save-exact prisma@7.8.0
pnpm --filter @mrb/api add --save-exact \
  @prisma/client@7.8.0 \
  @prisma/adapter-pg@7.8.0 \
  pg@8
pnpm --filter @mrb/api add -D --save-exact \
  @testcontainers/postgresql@12.0.4 \
  @types/pg@8
```

- [ ] **Step 4: Configure Prisma 7 and the initial migration**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../apps/api/src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
```

```sql
-- prisma/migrations/20260727000000_foundation/migration.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

`.env.example`:

```dotenv
DATABASE_URL=postgresql://meeting_room:meeting_room@localhost:5432/meeting_room?schema=public
API_INTERNAL_URL=http://localhost:3001
```

- [ ] **Step 5: Implement the NestJS database boundary**

```ts
// apps/api/src/database/database.service.ts
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>("DATABASE_URL"),
      connectionTimeoutMillis: 5_000
    });
    super({ adapter });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`DatabaseModule` is global and exports `DatabaseService`. `HealthService.ready`
calls `DatabaseService.ping()`:

```ts
async ready(): Promise<{ status: "ok"; database: "up" }> {
  try {
    await this.database.ping();
    return { status: "ok", database: "up" };
  } catch {
    throw new ServiceUnavailableException({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable"
      }
    });
  }
}
```

Inject `DatabaseService` beside `Clock` in `HealthService`. Do not expose the
connection string or driver error. `HealthController.ready()` delegates to
this method.

- [ ] **Step 6: Generate Prisma Client and run integration**

Run:

```bash
pnpm exec prisma generate
pnpm --filter @mrb/api test:integration
pnpm --filter @mrb/api typecheck
```

Expected: migration applies, readiness returns `200`, and generated Prisma files
remain ignored.

- [ ] **Step 7: Commit database readiness**

```bash
git add .env.example .gitignore prisma prisma.config.ts apps/api \
  package.json pnpm-lock.yaml
git commit -m "feat: add PostgreSQL readiness foundation"
```

---

### Task 5: Create the Next.js shell and ClearSpace token layer

**Files:**

- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/page.module.css`
- Create: `apps/web/src/app/page.spec.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: ClearSpace tokens from `docs/design-system.md` and
  `API_INTERNAL_URL`.
- Produces: Next.js App Router shell, same-origin `/api/*` rewrite, and the
  global semantic token contract used by later UI slices.

- [ ] **Step 1: Write the failing accessible page test**

```tsx
// apps/web/src/app/page.spec.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("foundation page", () => {
  it("identifies the product and exposes one primary next action", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Meeting Rooms" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Перевірити API" })
    ).toHaveAttribute("href", "/api/v1/health/live");
  });
});
```

- [ ] **Step 2: Run the web test and verify red**

Run:

```bash
pnpm --filter @mrb/web test:unit
```

Expected: FAIL because the page and test environment do not exist.

- [ ] **Step 3: Install the verified Next.js and React versions**

Run:

```bash
pnpm --filter @mrb/web add --save-exact \
  next@16.2.12 \
  react@19.2.8 \
  react-dom@19.2.8
pnpm --filter @mrb/web add -D --save-exact \
  @testing-library/jest-dom@6 \
  @testing-library/react@16 \
  @types/react@19 \
  @types/react-dom@19 \
  jsdom@26
```

- [ ] **Step 4: Define the ClearSpace semantic tokens**

`tokens.css` must contain every normative token from
`docs/design-system.md`, including:

```css
:root {
  --color-bg-app: #f7f9fc;
  --color-bg-surface: #ffffff;
  --color-bg-subtle: #eef1f6;
  --color-text-primary: #172033;
  --color-text-secondary: #5d6878;
  --color-border-default: #dce2ed;
  --color-border-strong: #bfc8d6;
  --color-action-primary: #3157d5;
  --color-action-hover: #2444b8;
  --color-action-soft: #eef2ff;
  --color-focus-ring: #7892ea;
  --color-booking-own: #1f6f63;
  --color-booking-own-bg: #e1f3ef;
  --color-danger: #b9323e;
  --color-danger-bg: #fdecee;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
  --radius-overlay: 1rem;
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-overlay: 240ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

Add the remaining design-system tokens verbatim. Outside `tokens.css`, use
only `var(--token-name)` for normative colors.

- [ ] **Step 5: Implement the root layout and foundation page**

Use `next/font/google` with Cyrillic subsets for Manrope and Inter. The page
contains:

```tsx
<main>
  <p>ClearSpace foundation</p>
  <h1>Meeting Rooms</h1>
  <p>Вебзастосунок готується до першого функціонального етапу.</p>
  <a href="/api/v1/health/live">Перевірити API</a>
</main>
```

The link is styled as the one primary action. Focus-visible uses a `2 px`
white offset and `--color-focus-ring`. The page must remain usable at
`390 px` width and `200%` zoom.

Configure Vitest explicitly:

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom"
  }
});
```

- [ ] **Step 6: Configure same-origin development proxy**

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`
      }
    ];
  }
};

export default config;
```

- [ ] **Step 7: Run web gates**

Run:

```bash
pnpm --filter @mrb/web test:unit
pnpm --filter @mrb/web typecheck
pnpm --filter @mrb/web build
```

Expected: component test passes and Next.js produces a production build.

- [ ] **Step 8: Commit the web shell**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: add ClearSpace web foundation"
```

---

### Task 6: Generate public contracts from NestJS OpenAPI

**Files:**

- Create: `apps/api/src/openapi/openapi.ts`
- Create: `apps/api/scripts/generate-openapi.ts`
- Create: `apps/api/test/openapi.spec.ts`
- Create: `apps/api/openapi.json`
- Create: `packages/contracts/src/generated/api.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `scripts/check-contracts.mjs`
- Modify: `apps/api/package.json`
- Modify: `packages/contracts/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `createApp()` and the health endpoints.
- Produces:
  `createOpenApiDocument(app): OpenAPIObject` and generated
  `paths["/api/v1/health/live"]` / `paths["/api/v1/health/ready"]` types.

- [ ] **Step 1: Write the failing OpenAPI contract test**

```ts
// apps/api/test/openapi.spec.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

describe("OpenAPI document", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => app.close());

  it("publishes versioned health contracts", () => {
    const document = createOpenApiDocument(app);

    expect(document.paths["/api/v1/health/live"]).toBeDefined();
    expect(document.paths["/api/v1/health/ready"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the contract test and verify red**

Run:

```bash
pnpm --filter @mrb/api test:unit -- openapi.spec.ts
```

Expected: FAIL because `createOpenApiDocument` does not exist.

- [ ] **Step 3: Install OpenAPI tooling**

Run:

```bash
pnpm --filter @mrb/api add --save-exact \
  @nestjs/swagger@11
pnpm --filter @mrb/contracts add -D --save-exact \
  openapi-typescript@7
```

- [ ] **Step 4: Implement the document builder**

```ts
// apps/api/src/openapi/openapi.ts
import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";

export function createOpenApiDocument(
  app: INestApplication
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Meeting Room Booking API")
    .setVersion("1.0")
    .build();

  return SwaggerModule.createDocument(app, config);
}
```

`generate-openapi.ts` creates the app, initializes it, serializes the document
with two-space indentation and a trailing newline, writes
`apps/api/openapi.json`, and always closes the app in `finally`.

- [ ] **Step 5: Add deterministic generation scripts**

`apps/api/package.json`:

```json
{
  "scripts": {
    "openapi:generate": "tsx scripts/generate-openapi.ts"
  }
}
```

`packages/contracts/package.json`:

```json
{
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "openapi-typescript ../../apps/api/openapi.json -o src/generated/api.ts",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2023 src/index.ts"
  }
}
```

`scripts/check-contracts.mjs` regenerates both files and fails when Git sees a
difference:

```js
import { spawnSync } from "node:child_process";

const generated = [
  "apps/api/openapi.json",
  "packages/contracts/src/generated/api.ts"
];

const generation = spawnSync("pnpm", ["contracts:generate"], {
  stdio: "inherit"
});
if (generation.status !== 0) {
  process.exit(generation.status ?? 1);
}

const diff = spawnSync(
  "git",
  ["diff", "--exit-code", "--", ...generated],
  { stdio: "inherit" }
);

if (diff.status !== 0) {
  console.error("generated contracts are stale");
  process.exit(diff.status ?? 1);
}
```

- [ ] **Step 6: Generate and verify contracts**

Run:

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm --filter @mrb/api test:unit
pnpm --filter @mrb/contracts typecheck
```

Expected: OpenAPI tests pass, generation is deterministic, and contract types
compile without importing Prisma models.

- [ ] **Step 7: Commit the contract pipeline**

```bash
git add apps/api packages/contracts scripts/check-contracts.mjs \
  package.json pnpm-lock.yaml
git commit -m "feat: generate contracts from OpenAPI"
```

---

### Task 7: Add local PostgreSQL, Playwright, and same-origin smoke coverage

**Files:**

- Create: `compose.dev.yaml`
- Create: `playwright.config.ts`
- Create: `e2e/foundation.spec.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: web port `3000`, API port `3001`, and `/api/v1/health/live`.
- Produces: `pnpm dev:infra`, `pnpm test:e2e`, desktop viewport
  `1440 x 900`, and mobile viewport `390 x 844`.

- [ ] **Step 1: Write the failing browser smoke test**

```ts
// e2e/foundation.spec.ts
import { expect, test } from "@playwright/test";

test("desktop shell and same-origin API are reachable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Meeting Rooms" })
  ).toBeVisible();

  const response = await page.request.get("/api/v1/health/live");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});

test("foundation page fits the approved mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
```

- [ ] **Step 2: Run Playwright and verify red**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because Playwright and its web servers are not configured.

- [ ] **Step 3: Add PostgreSQL development compose**

```yaml
# compose.dev.yaml
services:
  postgres:
    image: postgres:18.4-alpine
    environment:
      POSTGRES_DB: meeting_room
      POSTGRES_PASSWORD: meeting_room
      POSTGRES_USER: meeting_room
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U meeting_room -d meeting_room"]
      interval: 2s
      timeout: 3s
      retries: 20
    ports:
      - "5432:5432"
    volumes:
      - meeting_room_postgres:/var/lib/postgresql/data

volumes:
  meeting_room_postgres:
```

Do not add Redis, a broker, nginx, web, or API containers in this development
compose file.

- [ ] **Step 4: Install and configure Playwright**

Run:

```bash
pnpm add -Dw --save-exact @playwright/test@1.62
pnpm exec playwright install chromium
```

`playwright.config.ts` uses:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-first-failure"
  },
  webServer: [
    {
      command: "pnpm --filter @mrb/api dev",
      url: "http://127.0.0.1:3001/api/v1/health/live",
      reuseExistingServer: !process.env.CI
    },
    {
      command: "pnpm --filter @mrb/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI
    }
  ]
});
```

- [ ] **Step 5: Ignore runtime artifacts**

Add:

```gitignore
.env
.next/
apps/api/dist/
apps/api/src/generated/prisma/
coverage/
node_modules/
playwright-report/
test-results/
*.tsbuildinfo
```

- [ ] **Step 6: Run infrastructure and browser checks**

Run:

```bash
docker compose -f compose.dev.yaml config
pnpm test:e2e
```

Expected: compose validates and both Playwright tests pass through the
same-origin API rewrite.

- [ ] **Step 7: Commit development and browser harnesses**

```bash
git add compose.dev.yaml playwright.config.ts e2e .gitignore \
  package.json pnpm-lock.yaml
git commit -m "test: add foundation browser harness"
```

---

### Task 8: Add CI, README, and final foundation gates

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `docs/plans/active/foundation.md`
- Move after all gates pass:
  `docs/plans/active/foundation.md` ->
  `docs/plans/completed/foundation.md`

**Interfaces:**

- Consumes: every root script created in Tasks 1-7.
- Produces: reproducible clean-machine instructions, push/PR verification, and
  the completed foundation handoff.

- [ ] **Step 1: Add the CI workflow**

The workflow must:

```yaml
name: ci

on:
  push:
  pull_request:
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      DATABASE_URL: postgresql://meeting_room:meeting_room@127.0.0.1:5432/meeting_room
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.18.0
          cache: pnpm
      - run: corepack enable
      - run: corepack prepare pnpm@11.17.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm verify:workspace
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: npm test
      - run: pnpm test:integration
      - run: pnpm contracts:check
      - run: pnpm build
      - run: pnpm test:e2e
```

Do not add deployment, publishing, secrets, or production containers.

- [ ] **Step 2: Write clean-machine README instructions**

`README.md` must include exact commands for:

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm dev
```

It must also document:

- prerequisites: Node `24.18.0`, pnpm `11.17.0`, Docker;
- URLs: web `http://localhost:3000`, API liveness
  `http://localhost:3001/api/v1/health/live`;
- every quality command and what it proves;
- that no user, room, seed, auth, booking, recurrence, notification, or full
  Docker feature exists yet;
- that test credentials will be added in the auth/rooms slice;
- UTC storage and `Europe/Kyiv` policy as agreed architecture, not yet a
  foundation feature;
- the implemented bonus list is empty at this stage.

- [ ] **Step 3: Run the complete verification sequence**

Run, without omitting or weakening a command:

```bash
npm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm contracts:check
pnpm build
pnpm format:check
git diff --check
```

Expected:

- all commands exit `0`;
- integration output shows PostgreSQL `18.4` Testcontainer started and stopped;
- Playwright reports `2 passed`;
- no generated Prisma client or test artifact appears in `git status --short`.

- [ ] **Step 4: Review scope and dependency direction**

Run:

```bash
rg -n "Prisma|@prisma|DATABASE_URL" apps/web
rg -n "cors|enableCors" apps
git status --short
git diff --check
```

Expected:

- the first two searches produce no matches;
- Git contains only intended foundation files;
- there are no secrets, feature stubs, domain tables, debug logs, or
  unrelated changes.

- [ ] **Step 5: Record evidence and complete the active plan**

In the plan's progress section, record:

- exact command results;
- any unavailable check and its reason;
- final commit hashes;
- known risks;
- next smallest slice: auth, sessions, and seeded rooms.

Only after every required gate passes, move the plan:

```bash
mkdir -p docs/plans/completed
git mv docs/plans/active/foundation.md docs/plans/completed/foundation.md
```

- [ ] **Step 6: Commit the final foundation documentation**

```bash
git add .github/workflows/ci.yml README.md docs/plans
git commit -m "docs: complete foundation slice"
```

---

## Plan Self-Review Checklist

- [ ] Every task has one independently reviewable deliverable.
- [ ] Every runtime or domain dependency points in the direction required by
  `docs/architecture.md`.
- [ ] `apps/web` has no Prisma or database import.
- [ ] Browser networking remains same-origin.
- [ ] ClearSpace tokens are centralized and UI code uses semantic variables.
- [ ] Prisma 7 uses explicit generated output and a driver adapter.
- [ ] PostgreSQL integration tests run the full Nest application.
- [ ] `npm test` remains a working assignment entry point.
- [ ] Generated OpenAPI and contracts are deterministic and checked.
- [ ] Desktop and mobile smoke tests use the approved viewports.
- [ ] No auth, room, calendar, booking, recurrence, notification, nginx, or
  production compose implementation has leaked into the foundation slice.

## Progress

- Plan authored: 2026-07-27.
- Design system approval commit: `c4758cc`.
- User explicitly approved implementation directly on `main`.
- Foundation commits:
  - `93904c4` — pnpm workspace and pinned toolchain harness;
  - `d662be1` — injectable `Clock` boundary;
  - `60ea494` — NestJS liveness API;
  - `ed550b3` — Prisma/PostgreSQL boundary, Next.js shell, OpenAPI contracts,
    Playwright, CI, and README.
- Verified with Node.js `24.18.0` and pnpm `11.17.0`:
  - `pnpm install --frozen-lockfile` — passed;
  - `pnpm verify:workspace` — passed, 5 architectural packages;
  - `pnpm format:check` — passed;
  - `pnpm lint` — passed;
  - `pnpm typecheck` — passed;
  - `npm test` — passed, 4 files and 6 tests;
  - `pnpm contracts:check` — passed;
  - `pnpm build` — passed for `@mrb/time`, `@mrb/web`, and `@mrb/api`;
  - `pnpm test:e2e` — passed, 2 Playwright tests.
- Unavailable environment gates:
  - `pnpm test:integration` cannot start PostgreSQL because no Docker-compatible
    runtime or `docker-credential-desktop` executable is installed; Testcontainers
    fails with `spawn docker-credential-desktop ENOENT`;
  - `docker compose -f compose.dev.yaml config` cannot run because the `docker`
    command is unavailable.
- Known risk: the committed migration and readiness endpoint compile and their
  public contracts are generated, but the migrated PostgreSQL success path has
  not been runtime-verified in this environment.
- The plan remains active until Docker is available and both missing gates pass.
- Next action: install or expose a Docker-compatible runtime, run
  `docker compose -f compose.dev.yaml config` and `pnpm test:integration`, then
  repeat all final gates and move this plan to `docs/plans/completed/`.
- Next product slice after foundation completion: auth, stateful sessions, and
  seeded rooms.

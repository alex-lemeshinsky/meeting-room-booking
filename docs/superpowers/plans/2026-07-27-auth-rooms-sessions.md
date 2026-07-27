# Auth, Rooms, and Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver registration, login, secure opaque sessions, protected
routes, idempotently seeded users and rooms, and the first authenticated rooms
experience.

**Architecture:** NestJS remains authoritative for users, authentication,
sessions, CSRF, and rooms, backed by Prisma and PostgreSQL. Next.js renders
public authentication routes and a server-validated protected room list,
consuming only generated OpenAPI contracts.

**Tech Stack:** Node.js `24.18.0`, pnpm `11.17.0`, TypeScript `5.9.3`,
Next.js `16.2.12`, React `19.2.8`, NestJS `11.1.28`, Prisma ORM `7.9.0`,
PostgreSQL `18.4`, Argon2id through `argon2` `0.45.1`, Vitest `4.1.10`,
React Testing Library, Testcontainers `12.0.4`, and Playwright `1.62.0`.

## Global Constraints

- Follow
  `docs/superpowers/specs/2026-07-27-auth-rooms-sessions-design.md`.
- Implement `AUTH-01` through `AUTH-05`, `ROOM-01`, the room-list portion of
  `ROOM-02`, `SEED-01`, and `SEED-02`.
- Do not implement email verification, capacity filtering, schedules,
  bookings, profile editing, recurrence, notifications, or final Docker/nginx.
- Keep `UsersModule`, `AuthModule`, and `RoomsModule` acyclic; only
  `AuthModule` may depend on `UsersModule`.
- Do not import Prisma or domain rules into `apps/web`.
- Keep public TypeScript contracts generated from NestJS OpenAPI.
- Hash passwords with Argon2id using `memoryCost: 19_456`, `timeCost: 2`, and
  `parallelism: 1`.
- Persist only SHA-256 hashes of session and CSRF secrets.
- Use a 7-day sliding idle timeout bounded by a 30-day absolute timeout.
- Use the injected `Clock` for all session time decisions.
- Require accepted Origin and JSON bodies for registration and login.
- Require accepted Origin, JSON, and session-bound CSRF for authenticated
  mutations.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in
  production; CSRF cookies use the same attributes except `HttpOnly`.
- UI copy is Ukrainian and follows `docs/design-system.md`.
- Run PostgreSQL integration tests through Testcontainers; do not substitute
  SQLite or a mocked database.
- Every task starts with a failing test, ends with focused verification, and
  produces one coherent commit.
- After each verified step, update its checkbox. After each task, add the exact
  command and result to the Execution Evidence table at the end of this file.
- Preserve unrelated user changes and never commit generated Prisma client
  files, `.env`, cookies, tokens, passwords, or build artifacts.

## Source References

- Product behavior: `docs/features.md`
- Technical boundaries: `docs/architecture.md`
- Visual and accessibility contract: `docs/design-system.md`
- Approved slice design:
  `docs/superpowers/specs/2026-07-27-auth-rooms-sessions-design.md`
- [NestJS validation](https://docs.nestjs.com/techniques/validation)
- [NestJS cookies](https://docs.nestjs.com/techniques/cookies)
- [Prisma ORM v7 seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)
- [node-argon2](https://github.com/ranisalt/node-argon2)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Planned File Structure

```text
apps/api/
  scripts/
    start-e2e.ts
  src/
    app.module.ts
    bootstrap.ts
    common/
      common.module.ts
      errors/
        app-error.ts
        api-exception.filter.ts
      http/
        api-error.dto.ts
        express.d.ts
        request-id.middleware.ts
    auth/
      auth.controller.ts
      auth.module.ts
      auth.service.ts
      auth.types.ts
      dto/
        auth-response.dto.ts
        login.dto.ts
        register.dto.ts
      guards/
        csrf.guard.ts
        pre-auth-mutation.guard.ts
        session.guard.ts
      password/
        argon2-password-hasher.ts
        password-hasher.ts
      session/
        cookie.service.ts
        session-crypto.ts
        session-policy.ts
        session.service.ts
    users/
      public-user.dto.ts
      users.module.ts
      users.service.ts
    rooms/
      room.dto.ts
      rooms.controller.ts
      rooms.module.ts
      rooms.service.ts
  test/
    auth/
      auth.integration-spec.ts
      auth.service.spec.ts
      password-hasher.spec.ts
      session-policy.spec.ts
      session-security.spec.ts
    common/
      http-boundary.spec.ts
    rooms/
      rooms.integration-spec.ts
    support/
      postgres-test-app.ts
    persistence.integration-spec.ts
apps/web/
  src/
    app/
      page.tsx
      (auth)/
        auth.module.css
        login/page.tsx
        register/page.tsx
      (protected)/
        layout.tsx
        protected.module.css
        rooms/
          error.tsx
          loading.tsx
          page.tsx
    components/
      auth/
        login-form.spec.tsx
        login-form.tsx
        register-form.spec.tsx
        register-form.tsx
      rooms/
        room-list.spec.tsx
        room-list.tsx
      shell/
        logout-button.spec.tsx
        logout-button.tsx
        protected-header.tsx
    lib/
      api/
        browser.ts
        errors.ts
        server.ts
      auth/
        cookies.ts
        session.ts
e2e/
  auth-rooms.spec.ts
prisma/
  migrations/
    20260727190000_auth_rooms_sessions/
      migration.sql
  schema.prisma
  seed.ts
```

---

### Task 1: Add the user, session, and room persistence contract

**Files:**

- Modify: `prisma/schema.prisma`
- Create:
  `prisma/migrations/20260727190000_auth_rooms_sessions/migration.sql`
- Create: `apps/api/test/support/postgres-test-app.ts`
- Create: `apps/api/test/persistence.integration-spec.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `DATABASE_URL`, the Prisma 7 driver-adapter setup, and the
  foundation `btree_gist` migration.
- Produces: generated Prisma `User`, `Session`, and `Room` models plus
  `startPostgresTestApp(options)` for later integration tests.

- [ ] **Step 1: Generalize the PostgreSQL integration harness**

Create `apps/api/test/support/postgres-test-app.ts` with this public contract:

```ts
import type { INestApplication } from "@nestjs/common";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Clock } from "@mrb/time";

export interface PostgresTestApp {
  app: INestApplication;
  postgres: StartedPostgreSqlContainer;
  databaseUrl: string;
  stop(): Promise<void>;
}

export interface PostgresTestAppOptions {
  seed?: boolean;
  clock?: Clock;
}

export async function startPostgresTestApp(
  options: PostgresTestAppOptions = {}
): Promise<PostgresTestApp>;
```

Implementation requirements:

- start `postgres:18.4-alpine`;
- assign its connection URI to `process.env.DATABASE_URL`;
- set `process.env.APP_ORIGIN` to `http://127.0.0.1:3000`;
- run `pnpm exec prisma migrate deploy` from the repository root;
- optionally run `pnpm exec prisma db seed`;
- create and initialize the full NestJS app;
- close the app before stopping PostgreSQL in `stop()`;
- include command stderr in thrown migration or seed failures.

- [ ] **Step 2: Write the failing persistence integration test**

Create `apps/api/test/persistence.integration-spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../src/database/database.service.js";
import type { PostgresTestApp } from "./support/postgres-test-app.js";
import { startPostgresTestApp } from "./support/postgres-test-app.js";

describe("auth and rooms persistence", () => {
  let context: PostgresTestApp;

  beforeAll(async () => {
    context = await startPostgresTestApp();
  }, 120_000);

  afterAll(async () => {
    await context.stop();
  });

  it("creates users, sessions, and rooms with final constraints", async () => {
    const database = context.app.get(DatabaseService);
    const rows = await database.$queryRaw<Array<{ name: string }>>`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'sessions', 'rooms')
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.name)).toEqual(["rooms", "sessions", "users"]);
  });
});
```

- [ ] **Step 3: Run the test and confirm the missing migration fails**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/persistence.integration-spec.ts
```

Expected: FAIL because `users`, `sessions`, and `rooms` do not exist.

- [ ] **Step 4: Define the Prisma models**

Add these model shapes to `prisma/schema.prisma`:

```prisma
model User {
  id              String    @id @default(uuid()) @db.Uuid
  name            String
  emailNormalized String    @unique(map: "users_email_normalized_key") @map("email_normalized")
  passwordHash    String    @map("password_hash")
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz(3)
  weekStartsOn    Int       @default(1) @map("week_starts_on")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  sessions        Session[]

  @@map("users")
}

model Session {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @map("user_id") @db.Uuid
  tokenHash         String   @unique(map: "sessions_token_hash_key") @map("token_hash") @db.Char(64)
  csrfTokenHash     String   @map("csrf_token_hash") @db.Char(64)
  lastSeenAt        DateTime @map("last_seen_at") @db.Timestamptz(3)
  idleExpiresAt     DateTime @map("idle_expires_at") @db.Timestamptz(3)
  absoluteExpiresAt DateTime @map("absolute_expires_at") @db.Timestamptz(3)
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([idleExpiresAt])
  @@map("sessions")
}

model Room {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  floor     Int
  capacity  Int
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("rooms")
}
```

Add database checks in the migration:

```sql
ALTER TABLE "users"
  ADD CONSTRAINT "users_week_starts_on_check"
  CHECK ("week_starts_on" BETWEEN 1 AND 7);

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_capacity_check" CHECK ("capacity" > 0),
  ADD CONSTRAINT "rooms_floor_check" CHECK ("floor" >= 0);
```

Generate the migration with:

```bash
pnpm dev:infra
pnpm exec prisma migrate dev --name auth_rooms_sessions --create-only
```

Rename the generated directory to the exact planned timestamp if Prisma used a
different timestamp. Review the SQL and retain the explicit check constraints.

- [ ] **Step 5: Generate Prisma Client and run the focused test**

Run:

```bash
pnpm exec prisma generate
pnpm --filter @mrb/api exec vitest run test/persistence.integration-spec.ts
```

Expected: PASS with all three table names and final database constraints
present.

- [ ] **Step 6: Make the integration command discover all integration specs**

Set the API script to:

```json
{
  "test:integration": "vitest run --maxWorkers=1 test/**/*.integration-spec.ts"
}
```

Run:

```bash
pnpm test:integration
```

Expected: PASS for readiness and persistence against PostgreSQL.

- [ ] **Step 7: Commit the persistence slice**

```bash
git add prisma/schema.prisma prisma/migrations/20260727190000_auth_rooms_sessions/migration.sql apps/api/test/support/postgres-test-app.ts apps/api/test/persistence.integration-spec.ts apps/api/package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add auth and room persistence"
```

---

### Task 2: Add the HTTP boundary, users domain, and registration

**Files:**

- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/test/setup.ts`
- Modify: `.env.example`
- Create: `apps/api/src/common/common.module.ts`
- Create: `apps/api/src/common/errors/app-error.ts`
- Create: `apps/api/src/common/errors/api-exception.filter.ts`
- Create: `apps/api/src/common/http/api-error.dto.ts`
- Create: `apps/api/src/common/http/request-id.middleware.ts`
- Create: `apps/api/src/auth/password/password-hasher.ts`
- Create: `apps/api/src/auth/password/argon2-password-hasher.ts`
- Create: `apps/api/src/auth/guards/pre-auth-mutation.guard.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/auth-response.dto.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/users/public-user.dto.ts`
- Create: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/test/auth/password-hasher.spec.ts`
- Create: `apps/api/test/auth/auth.service.spec.ts`
- Create: `apps/api/test/common/http-boundary.spec.ts`
- Create: `apps/api/test/auth/auth.integration-spec.ts`

**Interfaces:**

- Consumes: Prisma `User`, `DatabaseService`, `CLOCK`, and `APP_ORIGIN`.
- Produces:
  `normalizeEmail(value: string): string`,
  `PasswordHasher`,
  `UsersService.createUser(input)`,
  `AuthService.register(input)`,
  `POST /api/v1/auth/register`, and the stable API error envelope.

- [ ] **Step 1: Install only the approved boundary dependencies**

Run:

```bash
pnpm --filter @mrb/api add argon2@0.45.1 class-transformer@0.5.1 class-validator@0.15.1 cookie-parser@1.4.7
pnpm --filter @mrb/api add -D @types/cookie-parser@1.4.10 @types/express@5.0.6
```

Expected: only `apps/api/package.json` and `pnpm-lock.yaml` change.

- [ ] **Step 2: Write failing unit tests for normalization and hashing**

Define the password boundary:

```ts
export const PASSWORD_HASHER = Symbol("PasswordHasher");

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  burnUnknownPasswordCheck(password: string): Promise<void>;
}
```

Write tests that require:

```ts
expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
expect(
  await hasher.verify(await hasher.hash("correct horse"), "correct horse")
).toBe(true);
expect(
  await hasher.verify(await hasher.hash("correct horse"), "wrong horse")
).toBe(false);
expect(await hasher.hash("correct horse")).toMatch(/^\$argon2id\$/);
```

- [ ] **Step 3: Run the unit tests and confirm missing symbols fail**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth/password-hasher.spec.ts test/auth/auth.service.spec.ts
```

Expected: FAIL because the password and users boundaries do not exist.

- [ ] **Step 4: Implement Argon2id and users**

Use these production parameters:

```ts
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;
```

`Argon2PasswordHasher` must create one process-local dummy hash promise from a
random password and use it in `burnUnknownPasswordCheck()`. Do not commit a
real or reusable credential as the dummy input.

Expose these users signatures:

```ts
export interface CreateUserInput {
  name: string;
  emailNormalized: string;
  passwordHash: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export function normalizeEmail(value: string): string;

export class UsersService {
  findByNormalizedEmail(emailNormalized: string): Promise<User | null>;
  createUser(input: CreateUserInput): Promise<User>;
  toPublicUser(user: User): PublicUser;
}
```

Map Prisma `P2002` on `emailNormalized` to:

```ts
throw new AppError(
  409,
  "EMAIL_ALREADY_REGISTERED",
  "Email already registered",
  {
    email: ["Обліковий запис із цим email уже існує"]
  }
);
```

- [ ] **Step 5: Write the failing HTTP-boundary and registration tests**

Add tests for:

```ts
await request(server)
  .post("/api/v1/auth/register")
  .set("Origin", "http://127.0.0.1:3000")
  .send({
    name: "  Олена  ",
    email: " OLENA@example.com ",
    password: "Rooms123!"
  })
  .expect(201);

await request(server)
  .post("/api/v1/auth/register")
  .set("Origin", "https://evil.example")
  .send({ name: "Олена", email: "olena@example.com", password: "Rooms123!" })
  .expect(403);

await request(server)
  .post("/api/v1/auth/register")
  .set("Origin", "http://127.0.0.1:3000")
  .set("Content-Type", "text/plain")
  .send("name=Olena")
  .expect(415);
```

Assert that invalid DTOs return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "email": ["Введіть коректний email"]
    },
    "requestId": "a-non-empty-string"
  }
}
```

- [ ] **Step 6: Configure the common HTTP boundary**

Add the application origin to `.env.example` and the test fallback:

```text
APP_ORIGIN=http://localhost:3000
```

```ts
process.env.APP_ORIGIN ??= "http://127.0.0.1:3000";
```

Make `CommonModule` global and export one `SystemClock` provider:

```ts
@Global()
@Module({
  exports: [CLOCK],
  providers: [{ provide: CLOCK, useClass: SystemClock }]
})
export class CommonModule {}
```

Remove the duplicate clock provider from `HealthModule`.

In `createApp()`:

```ts
app.use(cookieParser());
const requestIds = new RequestIdMiddleware();
app.use(requestIds.use);
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: validationExceptionFactory
  })
);
app.useGlobalFilters(new ApiExceptionFilter());
```

Implement `RequestIdMiddleware.use` as an arrow-function property so passing it
to Express preserves its instance. Generate a UUID when `X-Request-Id` is
absent, echo it in the response header, and log only request ID, method, route,
status, and duration when the response finishes. Do not log headers, cookies,
or bodies.

Implement `PreAuthMutationGuard` so `/register` and later `/login` accept only
`application/json` and an Origin equal to `APP_ORIGIN`. Missing, malformed, or
foreign Origin returns `ORIGIN_NOT_ALLOWED`; non-JSON returns
`UNSUPPORTED_MEDIA_TYPE`.

- [ ] **Step 7: Implement registration**

Use concrete DTO classes with Swagger and validation decorators:

```ts
export class RegisterDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "Введіть ім’я" })
  name!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? normalizeEmail(value) : value
  )
  @IsEmail({}, { message: "Введіть коректний email" })
  email!: string;

  @IsString()
  @Length(8, 72, { message: "Пароль має містити від 8 до 72 символів" })
  password!: string;
}
```

Expose:

```ts
@Post("register")
@HttpCode(201)
@UseGuards(PreAuthMutationGuard)
register(@Body() input: RegisterDto): Promise<AuthResponseDto>;
```

`AuthService.register()` hashes the original password, creates the normalized
user, and returns `{ user }` without creating cookies or a session.

- [ ] **Step 8: Run registration tests and quality checks**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth/password-hasher.spec.ts test/auth/auth.service.spec.ts test/common/http-boundary.spec.ts
pnpm --filter @mrb/api exec vitest run test/auth/auth.integration-spec.ts
pnpm --filter @mrb/api typecheck
pnpm --filter @mrb/api lint
```

Expected: PASS; integration assertions confirm `name` and email normalization,
Argon2id persistence, no raw password persistence, `201`, `400`, `403`, `409`,
and `415`.

- [ ] **Step 9: Commit registration and the common boundary**

```bash
git add .env.example apps/api/package.json pnpm-lock.yaml apps/api/src apps/api/test docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add secure user registration"
```

---

### Task 3: Implement session cryptography and policy

**Files:**

- Create: `apps/api/src/auth/auth.types.ts`
- Create: `apps/api/src/auth/session/session-crypto.ts`
- Create: `apps/api/src/auth/session/session-policy.ts`
- Create: `apps/api/src/auth/session/cookie.service.ts`
- Create: `apps/api/src/auth/session/session.service.ts`
- Create: `apps/api/src/auth/guards/session.guard.ts`
- Create: `apps/api/src/auth/guards/csrf.guard.ts`
- Create: `apps/api/src/common/http/express.d.ts`
- Create: `apps/api/test/auth/session-policy.spec.ts`
- Create: `apps/api/test/auth/session-security.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

**Interfaces:**

- Consumes: Prisma `Session`, `DatabaseService`, `CLOCK`, Express cookies.
- Produces:
  `createSecret()`,
  `hashSecret()`,
  `isMatchingSecret()`,
  `calculateSessionWindow()`,
  `SessionService.createSession()`,
  `SessionService.authenticate()`,
  `SessionGuard`, and `CsrfGuard`.

- [ ] **Step 1: Write failing session-policy tests**

Pin the boundary cases:

```ts
const now = new Date("2026-07-27T12:00:00.000Z");
const window = calculateSessionWindow(now);

expect(window.idleExpiresAt.toISOString()).toBe("2026-08-03T12:00:00.000Z");
expect(window.absoluteExpiresAt.toISOString()).toBe("2026-08-26T12:00:00.000Z");

const capped = calculateNextIdleExpiry(
  new Date("2026-08-25T12:00:00.000Z"),
  window.absoluteExpiresAt
);
expect(capped).toEqual(window.absoluteExpiresAt);
```

Also test that equality at either expiry is expired because validity requires
`now < expiry`.

- [ ] **Step 2: Write failing secret and CSRF tests**

Require 32-byte base64url secrets and 64-character lowercase hex hashes:

```ts
const secret = createSecret();
expect(Buffer.from(secret, "base64url")).toHaveLength(32);
expect(hashSecret(secret)).toMatch(/^[a-f0-9]{64}$/);
expect(isMatchingSecret(secret, hashSecret(secret))).toBe(true);
expect(isMatchingSecret("wrong", hashSecret(secret))).toBe(false);
```

Test CSRF rejection for missing cookie, missing header, unequal raw values,
malformed values, and a stored-hash mismatch.

Test cookie construction in both environments:

- the session cookie is `HttpOnly` and the CSRF cookie is not;
- both are `SameSite=Lax` and `Path=/`;
- both are `Secure` when `NODE_ENV=production`;
- clearing uses the same scope attributes as setting.

- [ ] **Step 3: Run the session tests and confirm missing modules fail**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth/session-policy.spec.ts test/auth/session-security.spec.ts
```

Expected: FAIL because the session boundary does not exist.

- [ ] **Step 4: Implement the pure session helpers**

Expose exact constants:

```ts
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionWindow {
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}
```

Implement all date results from epoch milliseconds and return new `Date`
instances. `isSessionExpired()` must treat expiry equality as expired.

Use Node `randomBytes(32)`, `createHash("sha256")`, and `timingSafeEqual`.
Reject malformed hashes before comparing buffers.

- [ ] **Step 5: Implement cookies and authenticated request typing**

Centralize:

```ts
export const SESSION_COOKIE = "mrb_session";
export const CSRF_COOKIE = "mrb_csrf";

export interface AuthContext {
  user: PublicUser;
  session: {
    id: string;
    csrfTokenHash: string;
    absoluteExpiresAt: Date;
  };
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}
```

Augment Express:

```ts
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}
```

`CookieService.setSessionCookies(response, secrets, absoluteExpiresAt)` and
`clearSessionCookies(response)` must use identical `Path`, `SameSite`, and
production `Secure` settings.

- [ ] **Step 6: Implement SessionService and guards**

Expose:

```ts
export interface CreatedSession {
  sessionSecret: string;
  csrfSecret: string;
  absoluteExpiresAt: Date;
}

export class SessionService {
  createSession(userId: string): Promise<CreatedSession>;
  authenticate(sessionSecret: string | undefined): Promise<AuthContext>;
  revoke(sessionId: string): Promise<void>;
}
```

`authenticate()` must:

1. hash the presented secret;
2. load session and user;
3. reject either expiry at equality;
4. atomically update `lastSeenAt` and capped `idleExpiresAt` only while both
   stored expiries remain greater than `now`;
5. return only the public user plus internal session context.

`SessionGuard` attaches the result to `request.auth`.

`CsrfGuard` validates both the cookie value and `X-CSRF-Token` independently
against `request.auth.session.csrfTokenHash` through `isMatchingSecret()`.
Therefore both raw values must represent the same stored secret without using
a variable-time raw-string comparison. It also enforces accepted Origin and
JSON content.

- [ ] **Step 7: Run focused session checks**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth/session-policy.spec.ts test/auth/session-security.spec.ts
pnpm --filter @mrb/api typecheck
pnpm --filter @mrb/api lint
```

Expected: PASS for all secret, expiry, cookie, guard, and CSRF cases.

- [ ] **Step 8: Commit the session boundary**

```bash
git add apps/api/src/auth apps/api/src/common/http/express.d.ts apps/api/test/auth docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add secure session policy"
```

---

### Task 4: Add login, session restoration, and logout

**Files:**

- Create: `apps/api/src/auth/dto/login.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/test/auth/auth.service.spec.ts`
- Modify: `apps/api/test/auth/auth.integration-spec.ts`
- Modify: `apps/api/test/support/postgres-test-app.ts`
- Modify: `apps/api/src/bootstrap.ts`

**Interfaces:**

- Consumes: `PasswordHasher`, `UsersService`, `SessionService`,
  `CookieService`, `SessionGuard`, and `CsrfGuard`.
- Produces:
  `POST /api/v1/auth/login`,
  `GET /api/v1/auth/session`, and
  `POST /api/v1/auth/logout`.

- [ ] **Step 1: Write failing service tests for indistinguishable login**

Cover both paths:

```ts
await expect(
  auth.login({ email: "missing@example.com", password: "wrong" })
).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });

await expect(
  auth.login({ email: "known@example.com", password: "wrong" })
).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });

expect(passwordHasher.burnUnknownPasswordCheck).toHaveBeenCalledWith("wrong");
```

Assert that successful login creates a new session without deleting existing
sessions for the same user.

- [ ] **Step 2: Write failing full-app authentication tests**

Use a Supertest agent to retain cookies and assert:

```ts
const login = await agent
  .post("/api/v1/auth/login")
  .set("Origin", "http://127.0.0.1:3000")
  .send({ email: "olena@example.com", password: "Rooms123!" })
  .expect(200);

expect(login.headers["set-cookie"]).toEqual(
  expect.arrayContaining([
    expect.stringContaining("mrb_session="),
    expect.stringContaining("mrb_csrf=")
  ])
);

await agent.get("/api/v1/auth/session").expect(200);
```

Add cases for:

- unknown email and wrong password returning identical code/message/status;
- `HttpOnly`, `SameSite=Lax`, and `Path=/` on the session cookie;
- no `HttpOnly` on the CSRF cookie;
- raw session and CSRF values absent from their database columns;
- 7-day idle and 30-day absolute expiry;
- idle sliding capped by absolute expiry with a `FixedClock` override;
- missing, idle-expired, and absolute-expired sessions returning `401`;
- logout without CSRF returning `403`;
- logout with cookie/header mismatch returning `403`;
- logout with valid Origin, JSON body, and CSRF returning `204`;
- only the current session being deleted;
- both cookies being cleared on logout.

Extend `PostgresTestAppOptions.clock`. When supplied, build the Nest testing
module with `AppModule`, override `CLOCK` with that value, create the Nest
application, and pass it through the same exported `configureApp(app)` function
used by production `createApp()`. This keeps the HTTP stack identical while
allowing exact expiry assertions.

- [ ] **Step 3: Run focused tests and confirm routes fail**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth/auth.service.spec.ts
pnpm --filter @mrb/api exec vitest run test/auth/auth.integration-spec.ts
```

Expected: FAIL with missing login, session, and logout routes.

- [ ] **Step 4: Implement the remaining AuthService methods**

Expose:

```ts
export interface LoginResult {
  user: PublicUser;
  session: CreatedSession;
}

export class AuthService {
  register(input: RegisterDto): Promise<AuthResponseDto>;
  login(input: LoginDto): Promise<LoginResult>;
}
```

For an unknown email, call `burnUnknownPasswordCheck(password)` before throwing
`INVALID_CREDENTIALS`. For an existing user, call `verify()` and throw the
identical error when it returns false.

- [ ] **Step 5: Implement controller routes**

Controller signatures:

```ts
@Post("login")
@HttpCode(200)
@UseGuards(PreAuthMutationGuard)
async login(
  @Body() input: LoginDto,
  @Res({ passthrough: true }) response: Response
): Promise<AuthResponseDto>;

@Get("session")
@UseGuards(SessionGuard)
session(@Req() request: AuthenticatedRequest): AuthResponseDto;

@Post("logout")
@HttpCode(204)
@UseGuards(SessionGuard, CsrfGuard)
async logout(
  @Req() request: AuthenticatedRequest,
  @Res({ passthrough: true }) response: Response
): Promise<void>;
```

Login sets cookies after the session row exists. Logout revokes
`request.auth.session.id` before clearing cookies.

- [ ] **Step 6: Run auth tests and API quality checks**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/auth
pnpm --filter @mrb/api exec vitest run test/auth/auth.integration-spec.ts
pnpm --filter @mrb/api typecheck
pnpm --filter @mrb/api lint
```

Expected: PASS for registration, generic credentials, multiple sessions,
cookie flags, restoration, expiry, CSRF, and logout.

- [ ] **Step 7: Commit the completed auth API**

```bash
git add apps/api/src/auth apps/api/src/bootstrap.ts apps/api/test/auth apps/api/test/support docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add login and session lifecycle"
```

---

### Task 5: Add protected rooms and idempotent seed data

**Files:**

- Create: `apps/api/src/rooms/room.dto.ts`
- Create: `apps/api/src/rooms/rooms.controller.ts`
- Create: `apps/api/src/rooms/rooms.module.ts`
- Create: `apps/api/src/rooms/rooms.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `prisma/seed.ts`
- Modify: `prisma.config.ts`
- Modify: `package.json`
- Create: `apps/api/test/rooms/rooms.integration-spec.ts`
- Modify: `apps/api/test/support/postgres-test-app.ts`

**Interfaces:**

- Consumes: Prisma `Room`, `SessionGuard`, and `Argon2PasswordHasher`.
- Produces:
  `RoomsService.list(): Promise<RoomDto[]>`,
  `GET /api/v1/rooms`, and
  `pnpm db:seed`.

- [ ] **Step 1: Write the failing rooms integration test**

Start the test app with `{ seed: true }`. Assert:

```ts
await request(server).get("/api/v1/rooms").expect(401);

const response = await authenticatedAgent.get("/api/v1/rooms").expect(200);

expect(response.body.rooms).toHaveLength(6);
expect(response.body.rooms).toEqual(
  [...response.body.rooms].sort(
    (left, right) =>
      left.floor - right.floor || left.name.localeCompare(right.name, "uk")
  )
);
expect(response.body.rooms[0]).toEqual({
  id: expect.any(String),
  name: expect.any(String),
  floor: expect.any(Number),
  capacity: expect.any(Number)
});
```

Run `pnpm exec prisma db seed` a second time and assert exactly two users and
six rooms remain with unchanged IDs.

- [ ] **Step 2: Run the test and confirm missing seed/route failure**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/rooms/rooms.integration-spec.ts
```

Expected: FAIL because no seed command or rooms route exists.

- [ ] **Step 3: Implement deterministic seed data**

Use stable UUIDs and these development records:

```ts
const users = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Олена",
    emailNormalized: "olena@example.com",
    password: "Rooms123!"
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Алекс",
    emailNormalized: "alex@example.com",
    password: "Meeting123!"
  }
] as const;

const rooms = [
  ["10000000-0000-4000-8000-000000000001", "Арсенал", 1, 4],
  ["10000000-0000-4000-8000-000000000002", "Дніпро", 1, 6],
  ["10000000-0000-4000-8000-000000000003", "Либідь", 2, 8],
  ["10000000-0000-4000-8000-000000000004", "Обрій", 2, 10],
  ["10000000-0000-4000-8000-000000000005", "Поділ", 3, 12],
  ["10000000-0000-4000-8000-000000000006", "Софія", 3, 16]
] as const;
```

Hash only passwords needed for missing users. Upsert by stable ID and update
non-secret descriptive fields without replacing an existing password hash.
Use the Prisma 7 PostgreSQL adapter and disconnect it in `finally`.

Configure:

```ts
migrations: {
  path: "prisma/migrations",
  seed: "pnpm --filter @mrb/api exec tsx ../../prisma/seed.ts"
}
```

Add root script:

```json
{
  "db:seed": "prisma db seed"
}
```

- [ ] **Step 4: Implement RoomsModule**

Expose:

```ts
export class RoomDto {
  id!: string;
  name!: string;
  floor!: number;
  capacity!: number;
}

export class RoomsService {
  async list(): Promise<RoomDto[]> {
    return this.database.room.findMany({
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      select: { id: true, name: true, floor: true, capacity: true }
    });
  }
}
```

Controller:

```ts
@Controller("rooms")
@UseGuards(SessionGuard)
export class RoomsController {
  @Get()
  async list(): Promise<{ rooms: RoomDto[] }> {
    return { rooms: await this.rooms.list() };
  }
}
```

- [ ] **Step 5: Verify rooms, seed, and all API integration**

Run:

```bash
pnpm exec prisma generate
pnpm --filter @mrb/api exec vitest run test/rooms/rooms.integration-spec.ts
pnpm test:integration
pnpm --filter @mrb/api typecheck
pnpm --filter @mrb/api lint
```

Expected: PASS; repeated seeds preserve two user IDs and six room IDs, anonymous
rooms access is `401`, and authenticated data is ordered and secret-free.

- [ ] **Step 6: Commit rooms and seed data**

```bash
git add apps/api/src/rooms apps/api/src/app.module.ts apps/api/test/rooms apps/api/test/support prisma/seed.ts prisma.config.ts package.json docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add protected rooms and seed data"
```

---

### Task 6: Publish the OpenAPI and generated TypeScript contracts

**Files:**

- Modify: `apps/api/src/openapi/openapi.ts`
- Modify: auth and room DTO/controller files under `apps/api/src/`
- Modify: `apps/api/test/openapi.spec.ts`
- Regenerate: `apps/api/openapi.json`
- Regenerate: `packages/contracts/src/generated/api.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: completed NestJS auth and rooms controllers.
- Produces generated operation types for:
  `register`, `login`, `logout`, `session`, and `rooms`.

- [ ] **Step 1: Expand the failing OpenAPI contract test**

Require:

```ts
expect(document.paths["/api/v1/auth/register"]?.post).toBeDefined();
expect(document.paths["/api/v1/auth/login"]?.post).toBeDefined();
expect(document.paths["/api/v1/auth/logout"]?.post).toBeDefined();
expect(document.paths["/api/v1/auth/session"]?.get).toBeDefined();
expect(document.paths["/api/v1/rooms"]?.get).toBeDefined();
expect(document.components?.schemas?.RegisterDto).toBeDefined();
expect(document.components?.schemas?.AuthResponseDto).toBeDefined();
expect(document.components?.schemas?.RoomDto).toBeDefined();
```

Also serialize the document and assert it contains none of:

```ts
expect(serialized).not.toMatch(
  /passwordHash|tokenHash|csrfTokenHash|sessionSecret|csrfSecret/
);
```

- [ ] **Step 2: Run the OpenAPI test and confirm schema gaps**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/openapi.spec.ts
```

Expected: FAIL until all DTOs and operations have explicit Swagger metadata.

- [ ] **Step 3: Add explicit operation and response metadata**

Add cookie authentication:

```ts
const config = new DocumentBuilder()
  .setTitle("Meeting Room Booking API")
  .setVersion("1.0")
  .addCookieAuth("mrb_session", {
    type: "apiKey",
    in: "cookie",
    name: "mrb_session"
  })
  .build();
```

Give every operation a stable `operationId`:

```text
register
login
logout
getSession
listRooms
```

Annotate concrete response DTOs. Never infer public response schemas from
Prisma types.

- [ ] **Step 4: Regenerate and consume contracts**

Run:

```bash
pnpm contracts:generate
pnpm --filter @mrb/web add "@mrb/contracts@workspace:*"
```

In web code, derive types from generated operations:

```ts
import type { operations } from "@mrb/contracts";

export type RegisterBody =
  operations["register"]["requestBody"]["content"]["application/json"];
export type AuthResponse =
  operations["getSession"]["responses"][200]["content"]["application/json"];
export type RoomsResponse =
  operations["listRooms"]["responses"][200]["content"]["application/json"];
```

- [ ] **Step 5: Verify contract freshness and package types**

Run:

```bash
pnpm --filter @mrb/api exec vitest run test/openapi.spec.ts
pnpm contracts:check
pnpm --filter @mrb/contracts typecheck
pnpm --filter @mrb/web typecheck
```

Expected: PASS with generated auth/rooms operations and no secret fields.

- [ ] **Step 6: Commit generated contracts**

```bash
git add apps/api/src apps/api/test/openapi.spec.ts apps/api/openapi.json packages/contracts/src/generated/api.ts apps/web/package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: publish auth and room contracts"
```

---

### Task 7: Build registration and login pages

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Delete: `apps/web/src/app/page.module.css`
- Delete: `apps/web/src/app/page.spec.tsx`
- Create: `apps/web/src/app/(auth)/auth.module.css`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Create: `apps/web/src/components/auth/login-form.tsx`
- Create: `apps/web/src/components/auth/login-form.spec.tsx`
- Create: `apps/web/src/components/auth/register-form.tsx`
- Create: `apps/web/src/components/auth/register-form.spec.tsx`
- Create: `apps/web/src/lib/api/browser.ts`
- Create: `apps/web/src/lib/api/errors.ts`
- Create: `apps/web/src/lib/auth/cookies.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: generated `register` and `login` contracts plus same-origin
  `/api/*`.
- Produces: `/register`, `/login`, reusable browser error parsing, and root
  routing into the auth/protected flow.

- [ ] **Step 1: Install the interaction-test helper**

Run:

```bash
pnpm --filter @mrb/web add -D @testing-library/user-event@14.6.1
```

- [ ] **Step 2: Write failing registration-form tests**

Cover:

```ts
expect(screen.getByLabelText("Ім’я")).toBeRequired();
expect(screen.getByLabelText("Email")).toBeRequired();
expect(screen.getByLabelText("Пароль")).toBeRequired();
```

Submit blank input and assert focus moves to `Ім’я`. Mock a
`EMAIL_ALREADY_REGISTERED` response and assert the email remains entered and
the field error is visible. Mock `201` and assert:

```ts
expect(router.replace).toHaveBeenCalledWith("/login?registered=1");
```

- [ ] **Step 3: Write failing login-form tests**

Assert:

- query `registered=1` shows successful-registration copy;
- `INVALID_CREDENTIALS` produces one generic message;
- the email value survives the error;
- the submit button is disabled only while the request is pending;
- success calls `router.replace("/rooms")` and `router.refresh()`.

- [ ] **Step 4: Run the component tests and confirm missing pages fail**

Run:

```bash
pnpm --filter @mrb/web exec vitest run src/components/auth
```

Expected: FAIL because the forms and API helper do not exist.

- [ ] **Step 5: Implement the browser API boundary**

Expose:

```ts
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    requestId: string;
  };
}

export class BrowserApiError extends Error {
  readonly code: string;
  readonly fields: Record<string, string[]>;
  readonly requestId: string;
}

export async function browserApi<TResponse>(
  path: string,
  init: RequestInit
): Promise<TResponse>;
```

For login and registration, send:

```ts
{
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input)
}
```

Do not manually set `Origin`; the browser supplies it.

- [ ] **Step 6: Implement accessible auth forms and routes**

Use real `<label>` elements, `aria-invalid`, `aria-describedby`, and a
focusable general error region with `role="alert"`. Keep independent local
state for field errors and request errors.

Registration success:

```ts
router.replace("/login?registered=1");
```

Login success:

```ts
router.replace("/rooms");
router.refresh();
```

Use only existing semantic CSS tokens. At mobile widths the form remains a
single padded column without horizontal overflow.

- [ ] **Step 7: Replace the foundation root route**

Make `/` a server redirect based only on cookie presence:

```ts
const cookieStore = await cookies();
redirect(cookieStore.has(SESSION_COOKIE) ? "/rooms" : "/login");
```

This is only an optimization; `/rooms` performs authoritative API validation.

- [ ] **Step 8: Run focused web checks**

Run:

```bash
pnpm --filter @mrb/web exec vitest run src/components/auth
pnpm --filter @mrb/web typecheck
pnpm --filter @mrb/web lint
```

Expected: PASS for labels, errors, input preservation, redirect behavior,
loading state, and responsive structure.

- [ ] **Step 9: Commit public authentication UI**

```bash
git add apps/web package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add registration and login pages"
```

---

### Task 8: Build the protected shell, logout, and room list

**Files:**

- Create: `apps/web/src/lib/api/server.ts`
- Create: `apps/web/src/lib/auth/session.ts`
- Create: `apps/web/src/app/(protected)/layout.tsx`
- Create: `apps/web/src/app/(protected)/protected.module.css`
- Create: `apps/web/src/app/(protected)/rooms/page.tsx`
- Create: `apps/web/src/app/(protected)/rooms/loading.tsx`
- Create: `apps/web/src/app/(protected)/rooms/error.tsx`
- Create: `apps/web/src/components/shell/protected-header.tsx`
- Create: `apps/web/src/components/shell/logout-button.tsx`
- Create: `apps/web/src/components/shell/logout-button.spec.tsx`
- Create: `apps/web/src/components/rooms/room-list.tsx`
- Create: `apps/web/src/components/rooms/room-list.spec.tsx`

**Interfaces:**

- Consumes: generated `getSession` and `listRooms` contracts,
  `API_INTERNAL_URL`, incoming session cookie, and browser CSRF cookie.
- Produces: authoritative protected layout, `/rooms`, and secure logout.

- [ ] **Step 1: Write failing room-list component tests**

Require:

```ts
render(<RoomList rooms={[]} />);
expect(screen.getByRole("heading", { name: "Кімнат поки немає" }))
  .toBeVisible();

render(
  <RoomList
    rooms={[{ id: "room-1", name: "Дніпро", floor: 1, capacity: 6 }]}
  />
);
expect(screen.getByRole("heading", { name: "Дніпро" })).toBeVisible();
expect(screen.getByText("1 поверх")).toBeVisible();
expect(screen.getByText("6 місць")).toBeVisible();
expect(screen.queryByRole("link", { name: /розклад/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Write failing logout tests**

Set `document.cookie = "mrb_csrf=csrf-value"` and assert the request contains:

```ts
expect(fetch).toHaveBeenCalledWith(
  "/api/v1/auth/logout",
  expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf-value"
    }),
    body: "{}"
  })
);
```

Success redirects to `/login?loggedOut=1`; failure keeps the user in context
and shows an accessible retryable error.

- [ ] **Step 3: Run component tests and confirm missing components fail**

Run:

```bash
pnpm --filter @mrb/web exec vitest run src/components/rooms src/components/shell
```

Expected: FAIL because protected components do not exist.

- [ ] **Step 4: Implement server-only API reads**

Expose:

```ts
export async function serverApi<TResponse>(
  path: string,
  sessionSecret: string
): Promise<TResponse>;

export async function getCurrentSession(): Promise<AuthResponse>;
export async function getRooms(): Promise<RoomsResponse>;
```

Use:

```ts
await fetch(`${apiInternalUrl}${path}`, {
  headers: { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionSecret)}` },
  cache: "no-store"
});
```

Forward only the session cookie. Convert `401` into a typed
`UnauthenticatedError`; never cache responses across requests.

- [ ] **Step 5: Implement the protected layout**

The layout:

1. reads the session cookie;
2. redirects missing cookies to `/login?reason=session`;
3. calls `getCurrentSession()`;
4. redirects authoritative `401` the same way;
5. renders `ProtectedHeader` with the returned user name.

The header contains product identity, the user's name, and logout only. Do not
add links to calendar, bookings, profile, or notifications.

- [ ] **Step 6: Implement rooms loading, content, and error states**

`rooms/page.tsx` fetches the protected rooms response and renders `RoomList`.
If that request returns `401` after the layout check, redirect to
`/login?reason=session`. `loading.tsx` renders six geometry-matching skeleton
rows with an accessible loading label. `error.tsx` is a client error boundary
with:

```tsx
<button type="button" onClick={() => reset()}>
  Спробувати ще
</button>
```

Use semantic tokens and responsive grid/list behavior. Do not add capacity
filters, booking status, or schedule links.

- [ ] **Step 7: Implement CSRF-aware logout**

Read only the `mrb_csrf` cookie, pass it through `X-CSRF-Token`, send `{}` as
JSON, and on success:

```ts
router.replace("/login?loggedOut=1");
router.refresh();
```

- [ ] **Step 8: Run focused protected-UI checks**

Run:

```bash
pnpm --filter @mrb/web exec vitest run src/components/rooms src/components/shell
pnpm --filter @mrb/web typecheck
pnpm --filter @mrb/web lint
pnpm --filter @mrb/web build
```

Expected: PASS with server-only API code excluded from client bundles and no
dead destinations.

- [ ] **Step 9: Commit the protected rooms experience**

```bash
git add apps/web/src docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "feat: add protected rooms experience"
```

---

### Task 9: Add deterministic PostgreSQL-backed browser journeys

**Files:**

- Create: `apps/api/scripts/start-e2e.ts`
- Modify: `playwright.config.ts`
- Delete: `e2e/foundation.spec.ts`
- Create: `e2e/auth-rooms.spec.ts`

**Interfaces:**

- Consumes: PostgreSQL Testcontainers, Prisma migrate/seed, API/web dev
  servers, and the complete web flow.
- Produces: a self-contained `pnpm test:e2e` that requires Docker but no
  manually prepared database.

- [ ] **Step 1: Write the failing browser journey**

Use a serial Playwright describe block. Cover:

```ts
await page.goto("/rooms");
await expect(page).toHaveURL(/\/login\?reason=session/);

await page.getByRole("link", { name: "Створити обліковий запис" }).click();
await page.getByLabel("Ім’я").fill("Тестова користувачка");
await page.getByLabel("Email").fill("journey@example.com");
await page.getByLabel("Пароль").fill("Journey123!");
await page.getByRole("button", { name: "Зареєструватися" }).click();

await expect(page).toHaveURL(/\/login\?registered=1/);
await page.getByLabel("Email").fill("journey@example.com");
await page.getByLabel("Пароль").fill("Journey123!");
await page.getByRole("button", { name: "Увійти" }).click();

await expect(page).toHaveURL(/\/rooms/);
await expect(
  page.getByRole("heading", { name: "Переговорні кімнати" })
).toBeVisible();
await expect(page.getByRole("heading", { name: "Дніпро" })).toBeVisible();

await page.reload();
await expect(page).toHaveURL(/\/rooms/);

await page.getByRole("button", { name: "Вийти" }).click();
await expect(page).toHaveURL(/\/login\?loggedOut=1/);
await page.goto("/rooms");
await expect(page).toHaveURL(/\/login\?reason=session/);
```

Add a `390 x 844` viewport case proving auth and room pages have no horizontal
page overflow.

- [ ] **Step 2: Run E2E and confirm database preparation failure**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because Playwright does not prepare a migrated and seeded
PostgreSQL database.

- [ ] **Step 3: Implement the isolated E2E API launcher**

`apps/api/scripts/start-e2e.ts` must:

1. start `postgres:18.4-alpine`;
2. run `pnpm exec prisma migrate deploy`;
3. run `pnpm exec prisma db seed`;
4. spawn `pnpm --filter @mrb/api exec tsx src/main.ts` with:

```ts
{
  DATABASE_URL: postgres.getConnectionUri(),
  APP_ORIGIN: "http://127.0.0.1:3000",
  NODE_ENV: "test",
  PORT: "3001"
}
```

5. forward stdout/stderr;
6. on `SIGINT`, `SIGTERM`, or child exit, terminate the child and stop the
   container;
7. exit nonzero when migration, seed, or the API child fails.

Resolve the repository root from `import.meta.dirname` and use it as `cwd` for
Prisma, seed, and API child commands.

Never print database passwords, cookies, or tokens.

- [ ] **Step 4: Make Playwright use the isolated launcher**

Set the API web server entry to:

```ts
{
  command: "pnpm --filter @mrb/api exec tsx scripts/start-e2e.ts",
  url: "http://127.0.0.1:3001/api/v1/health/ready",
  reuseExistingServer: false,
  timeout: 120_000
}
```

Set the web entry environment:

```ts
const webServer = {
  env: {
    API_INTERNAL_URL: "http://127.0.0.1:3001"
  }
};
```

Keep Chromium, desktop, and mobile coverage. Ensure Playwright terminates both
web server processes after the run.

- [ ] **Step 5: Run browser and focused full-stack checks**

Run:

```bash
pnpm test:e2e
pnpm test:integration
pnpm contracts:check
```

Expected: PASS with registration, login, restored session, six rooms, logout,
unauthorized redirect, and mobile width against real PostgreSQL.

- [ ] **Step 6: Commit deterministic E2E**

```bash
git add apps/api/scripts/start-e2e.ts playwright.config.ts e2e docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "test: cover authenticated rooms journey"
```

---

### Task 10: Document and verify the completed slice

**Files:**

- Modify: `README.md`
- Modify: `scripts/verify-workspace.test.mjs`
- Modify: `docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md`

**Interfaces:**

- Consumes: the complete verified slice.
- Produces: clean-machine setup instructions, documented development
  credentials, verification evidence, and final handoff state.

- [ ] **Step 1: Write the documentation acceptance check**

Extend `scripts/verify-workspace.test.mjs` to read `.env.example` and
`README.md` and assert:

```js
assert.match(envExample, /^APP_ORIGIN=http:\/\/localhost:3000$/m);
assert.match(readme, /pnpm db:seed/);
assert.match(readme, /olena@example\.com/);
assert.match(readme, /alex@example\.com/);
```

Run:

```bash
node --test scripts/verify-workspace.test.mjs
```

Expected: FAIL until environment, seed, and test-credential instructions are
documented.

- [ ] **Step 2: Update environment and README**

Document this clean-machine flow:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:infra
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm db:seed
pnpm dev
```

Document non-production credentials:

```text
olena@example.com / Rooms123!
alex@example.com / Meeting123!
```

State explicitly that this slice includes mandatory auth/session behavior and
the room list, while email verification, capacity filtering, and calendars
remain later slices.

- [ ] **Step 3: Run focused documentation and secret scans**

Run:

```bash
node --test scripts/verify-workspace.test.mjs
rg -n -i 'cookie|csrf|session|password' README.md .env.example
! git grep -n -E 'mrb_session=[A-Za-z0-9_-]{20,}|mrb_csrf=[A-Za-z0-9_-]{20,}'
```

Expected: the workspace test passes; only documented non-production
credentials appear; no raw generated session or CSRF token is tracked.

- [ ] **Step 4: Run every repository gate**

Run in this order:

```bash
npm test
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm contracts:check
pnpm build
pnpm format:check
pnpm verify:workspace
git diff --check
```

Expected: every command exits `0`. Record duration and concise result in the
Execution Evidence table. Never mark an unrun gate as passed.

- [ ] **Step 5: Review the complete diff and scope**

Run:

```bash
git status --short
git diff --stat
git diff -- prisma apps/api apps/web packages/contracts e2e README.md .env.example package.json pnpm-lock.yaml
```

Confirm:

- no email-verification token table or route exists;
- no room-capacity query parameter exists;
- no calendar, schedule, or booking implementation exists;
- no raw password, session token, or CSRF token is tracked;
- Next.js does not import Prisma;
- generated contracts contain no internal model fields;
- all changed files belong to this slice.

- [ ] **Step 6: Commit documentation and final evidence**

```bash
git add README.md scripts/verify-workspace.test.mjs docs/superpowers/plans/2026-07-27-auth-rooms-sessions.md
git commit -m "docs: complete auth and rooms slice"
```

- [ ] **Step 7: Verify final Git state**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: clean worktree and a coherent sequence of verified slice commits.

## Execution Evidence

| Task                  | Commit      | Focused verification | Result  |
| --------------------- | ----------- | -------------------- | ------- |
| 1. Persistence        | Not started | Not run              | Pending |
| 2. Registration       | Not started | Not run              | Pending |
| 3. Session policy     | Not started | Not run              | Pending |
| 4. Auth lifecycle     | Not started | Not run              | Pending |
| 5. Rooms and seed     | Not started | Not run              | Pending |
| 6. Contracts          | Not started | Not run              | Pending |
| 7. Public auth UI     | Not started | Not run              | Pending |
| 8. Protected rooms UI | Not started | Not run              | Pending |
| 9. Browser journeys   | Not started | Not run              | Pending |
| 10. Final gates       | Not started | Not run              | Pending |

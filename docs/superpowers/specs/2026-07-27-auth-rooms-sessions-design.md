# Auth, Rooms, and Sessions — Design Specification

Date: 2026-07-27
Status: approved

## 1. Purpose

Deliver the first complete product journey on top of the finished foundation:
a user can register, sign in, retain a secure server-side session, view the
protected room list, sign out, and be denied access after the session ends.

This is one end-to-end vertical slice implemented in dependency order:

1. persistence;
2. users, authentication, and session security;
3. rooms and seed data;
4. OpenAPI and generated TypeScript contracts;
5. public authentication pages and the protected room list;
6. integration and browser verification.

The slice follows:

- `AUTH-01` through `AUTH-05`;
- `ROOM-01` and the room-list portion of `ROOM-02`;
- `SEED-01` and `SEED-02`;
- the phase 1 scope in `docs/features.md`;
- the authentication, module-boundary, API, and test rules in
  `docs/architecture.md`;
- the authentication, room-card, form, responsive, and accessibility rules in
  `docs/design-system.md`.

## 2. Goals

- Add persistent users, opaque stateful sessions, and rooms.
- Hash passwords with Argon2id.
- Store only hashes of session and CSRF secrets.
- Support registration, login, session restoration, and logout.
- Protect both API and web routes through authoritative NestJS session checks.
- Seed five or six rooms and two documented test users idempotently.
- Publish generated public contracts without exposing Prisma models or secret
  fields.
- Replace the foundation landing page with usable Ukrainian authentication and
  room-list experiences.
- Prove the slice against PostgreSQL and in a real Chromium browser.

## 3. Non-goals

The slice does not implement:

- email verification or verification-token persistence;
- room capacity filtering;
- room administration;
- calendar or room-schedule reads;
- selection of a room into a calendar route;
- current or next booking status on room cards;
- bookings, recurrence, notifications, or profile editing;
- the final mobile navigation system;
- production nginx or full application Docker Compose.

The schema may include already-approved future-facing user fields such as
`emailVerifiedAt` and `weekStartsOn`, but no behavior for their later features
is added.

## 4. Architectural approach

The slice keeps the existing modular-monolith boundary.

### 4.1. NestJS modules

`UsersModule` owns:

- user persistence;
- name and email normalization;
- lookup by normalized email;
- creation of users with an already-hashed password;
- public-user mapping.

`AuthModule` depends on `UsersModule` and owns:

- registration and login orchestration;
- Argon2id password hashing and verification;
- opaque session creation and validation;
- session and CSRF hashing;
- session-cookie creation and clearing;
- Origin and JSON-content checks;
- authenticated CSRF checks;
- the reusable authenticated-user guard.

`RoomsModule` owns:

- room persistence;
- the authenticated room-list query;
- public-room mapping.

`RoomsModule` does not depend on `AuthModule`. Route protection consumes the
guard exported by the authentication boundary. No module depends on
`RoomsModule` in this slice.

Cross-cutting NestJS setup adds:

- global DTO validation;
- a stable API error envelope;
- request IDs;
- centralized mapping of expected domain and Prisma failures;
- redaction-safe request logging.

### 4.2. Next.js boundaries

Next.js owns routing, rendering, form state, and presentation. It never imports
Prisma, reads PostgreSQL, hashes secrets, or decides whether a session is
valid.

Public routes:

- `/login`;
- `/register`.

Protected route:

- `/rooms`.

The protected layout may use session-cookie presence only as an early redirect
optimization. It authoritatively calls `GET /api/v1/auth/session` before
rendering protected content.

Server-side reads call NestJS through a private API base URL and forward the
incoming session cookie. Browser calls use the existing same-origin `/api/*`
path. The private base URL is environment configuration and is not exposed as
a browser secret.

### 4.3. Contracts

NestJS OpenAPI is the public API source. `packages/contracts` is regenerated
from that schema and is the only shared source of request and response types
for the web application.

Prisma models, password hashes, token hashes, raw cookies, and internal expiry
implementation details never appear in public response types.

## 5. Persistence design

Prisma adds the following domain records using PostgreSQL-native timestamps
for instants and UTC storage.

### 5.1. User

Fields:

- `id`;
- `name`;
- `emailNormalized`, unique;
- `passwordHash`;
- nullable `emailVerifiedAt`;
- `weekStartsOn`, default `1`;
- `createdAt`;
- `updatedAt`.

Registration trims leading and trailing whitespace from `name`. The result must
not be empty. Email normalization trims leading and trailing whitespace and
lowercases the result. Passwords are not trimmed or otherwise transformed.

The database unique constraint on normalized email is the final duplicate
guarantee. Application lookup is used only to provide a friendly response.

### 5.2. Session

Fields:

- `id`;
- `userId`;
- unique `tokenHash`;
- `csrfTokenHash`;
- `lastSeenAt`;
- `idleExpiresAt`;
- `absoluteExpiresAt`;
- `createdAt`.

Deleting a user cascades to their sessions. Raw session and CSRF values exist
only in the request/response cookie boundary and transient process memory.

Session duration:

- idle timeout: 7 days;
- absolute timeout: 30 days;
- successful authenticated use moves idle expiry to the earlier of
  `now + 7 days` and the absolute expiry;
- neither expiry can be extended beyond the original absolute expiry.

All current-time decisions use the injected `Clock`.

### 5.3. Room

Fields:

- `id`;
- `name`;
- `floor`;
- `capacity`;
- `createdAt`;
- `updatedAt`.

The room-list response is ordered by floor and then name. It contains only the
room identifier, name, floor, and capacity in this slice.

### 5.4. Seed

The seed creates:

- five or six rooms with varied names, floors, and capacities;
- two test users with documented local-development credentials.

Seed identities are stable, and writes use upsert or equivalent conflict-safe
logic. Re-running the seed changes neither identity nor row count. Test
passwords are hashed through the same Argon2id implementation as registration.
README documents the non-production credentials without placing real secrets
in the repository.

Demo bookings remain deferred until the booking schema exists.

## 6. Authentication and session flow

### 6.1. Registration

`POST /api/v1/auth/register` accepts:

- `name`;
- `email`;
- `password`.

The API:

1. validates and normalizes the input;
2. hashes the password with Argon2id;
3. creates the user;
4. maps a concurrent unique-email failure to the same stable field error as a
   pre-check;
5. returns a public user response without creating a session.

Successful registration redirects the web user to login with a persistent
success message. The user must explicitly log in.

### 6.2. Login

`POST /api/v1/auth/login` accepts email and password.

The API normalizes email identically to registration. Unknown-email and
incorrect-password cases return the same `INVALID_CREDENTIALS` status, code,
and public message. The implementation performs a password-verification path
for both cases so the public behavior does not trivially reveal account
existence.

On success the API:

1. generates independent cryptographically random session and CSRF secrets;
2. stores their SHA-256 hashes in a new session row;
3. sets the session and CSRF cookies;
4. returns the public current-user representation.

Login does not invalidate sessions on other devices.

### 6.3. Cookie contract

Cookie names are centralized configuration rather than repeated string
literals.

Session cookie:

- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- `Secure` in production;
- expiry aligned with absolute session expiry.

CSRF cookie:

- readable by browser JavaScript;
- `SameSite=Lax`;
- `Path=/`;
- `Secure` in production;
- expiry aligned with absolute session expiry.

### 6.4. Session restoration

`GET /api/v1/auth/session`:

1. hashes the presented session-cookie value;
2. finds the corresponding session and user;
3. rejects missing, idle-expired, or absolute-expired sessions;
4. advances `lastSeenAt` and idle expiry without crossing absolute expiry;
5. returns the public user.

Expired sessions may be removed opportunistically after they are rejected.
Authentication never trusts user identity supplied by the browser.

### 6.5. Logout

`POST /api/v1/auth/logout` requires a valid session, accepted Origin, JSON
content, and a valid CSRF cookie/header pair.

It deletes only the current session and clears both cookies. It does not end
sessions belonging to other devices. After logout, direct navigation to a
protected page and direct access to a protected API both fail.

## 7. CSRF and request-boundary security

Authenticated `POST`, `PATCH`, and `DELETE` requests require all of:

- an Origin matching configured application origins;
- JSON request content;
- a CSRF cookie;
- the same raw value in `X-CSRF-Token`;
- a SHA-256 hash matching the current session row.

Registration and login are explicit pre-authentication exceptions because no
session exists to bind a CSRF secret to. They still require:

- an accepted Origin;
- a JSON request body.

This exception applies only to these two endpoints. It does not weaken logout
or later authenticated mutations.

Secret comparisons use timing-safe byte comparison after validating encoding
and length. Passwords, cookie values, authorization state, and raw or hashed
session and CSRF tokens are excluded from logs.

## 8. API surface

The slice adds:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session
GET  /api/v1/rooms
```

Behavior:

- registration returns `201`;
- login and current session return `200`;
- logout returns `204`;
- rooms returns `200`;
- missing or invalid authentication returns `401`;
- duplicate normalized email returns `409`;
- rejected Origin or CSRF returns `403`;
- invalid input returns `400`;
- non-JSON mutation content returns `415`.

The rooms endpoint requires an authenticated session. Capacity-filter query
parameters are not added in this slice.

## 9. Error contract and observability

Expected API errors use one envelope containing:

- stable machine-readable `code`;
- human-safe `message`;
- optional field-error mapping;
- `requestId`.

The slice defines at least:

- `VALIDATION_ERROR`;
- `EMAIL_ALREADY_REGISTERED`;
- `INVALID_CREDENTIALS`;
- `UNAUTHENTICATED`;
- `CSRF_INVALID`;
- `ORIGIN_NOT_ALLOWED`;
- `UNSUPPORTED_MEDIA_TYPE`;
- `INTERNAL_ERROR`.

The UI maps behavior from stable codes rather than parsing message text.
Correctable form errors preserve user input. Unexpected failures return
`INTERNAL_ERROR` without a stack trace. Each request log contains request ID,
route, status, and duration while applying the secret-redaction rules.

## 10. Web experience

### 10.1. Registration and login

Both pages follow the ClearSpace design system:

- one form column up to `420px`;
- short display heading;
- persistent labels rather than placeholder-only fields;
- inline field errors;
- a general error region above the actions;
- visible keyboard focus;
- an explicit text link between registration and login;
- Ukrainian interface copy.

The first invalid field receives focus after client validation. During a
request, only the active submit action is disabled and displays a local loading
state. Correctable failures do not clear entered values.

Successful registration routes to login with a success message. Successful
login routes to `/rooms`.

### 10.2. Protected shell

The shell contains only:

- product identity;
- current-user name;
- logout.

It does not expose navigation to calendar, bookings, profile, or notifications
before those destinations exist. An expired or invalid session redirects to
login with a concise explanation.

### 10.3. Rooms

The server-rendered room page validates the session and then fetches rooms.
Each room card or row shows:

- name;
- floor;
- capacity.

The page has explicit loading, empty, and server-error states. The error state
offers retry. The layout works at desktop and mobile widths and meets the
design system's focus, contrast, text-resizing, and semantic-heading
requirements.

This slice does not add a dead schedule link. The calendar-reading slice will
add room selection and the destination URL together.

### 10.4. Web API clients

The server API client:

- uses the private NestJS base URL;
- forwards only the required incoming cookies;
- does not cache user-specific responses across requests.

The browser API client:

- calls same-origin `/api/*`;
- reads the CSRF cookie only for authenticated mutations;
- copies it to `X-CSRF-Token`;
- requests JSON responses and sends JSON mutation bodies.

## 11. Verification strategy

### 11.1. Unit tests

Focused unit tests cover:

- name trimming and rejection of blank names;
- identical email normalization in registration and login;
- password length boundaries and unmodified password input;
- password hashing and verification abstraction;
- session and CSRF hashing;
- idle and absolute expiry boundaries;
- idle-extension capping;
- Origin policy;
- CSRF comparison;
- authentication guard behavior;
- stable error mapping.

### 11.2. Integration tests

Integration tests start the full NestJS application against PostgreSQL through
Testcontainers and apply the real Prisma migration.

They prove:

- registration stores an Argon2id hash and never the raw password;
- normalized-email uniqueness, including a concurrent database conflict;
- unknown-user and wrong-password login responses are indistinguishable;
- successful login sets the required cookie attributes;
- the database stores hashes rather than raw session or CSRF values;
- session restoration works and updates idle expiry within the absolute bound;
- idle-expired and absolute-expired sessions are rejected;
- pre-authentication Origin and JSON checks are enforced;
- authenticated Origin and CSRF checks are enforced;
- logout deletes only the current session and clears both cookies;
- `/rooms` is inaccessible anonymously and returns the expected public data
  when authenticated;
- repeated seed execution leaves exactly the intended users and rooms.

### 11.3. Component tests

React Testing Library covers:

- form labels, accessible errors, and focus movement;
- preservation of correctable input;
- loading and disabled submit behavior;
- registration-success presentation on login;
- generic invalid-credentials presentation;
- room loading, empty, and server-error states;
- logout behavior.

### 11.4. Browser tests

Playwright in Chromium covers:

- registration, redirect to login, and login;
- direct unauthorized navigation to `/rooms`;
- successful protected room rendering;
- session survival after reload;
- logout and subsequent route protection;
- the core journey at a mobile viewport.

The browser scenario runs against the real NestJS API and PostgreSQL, not
mocked authentication.

### 11.5. Repository gates

The completed slice runs:

```text
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

## 12. Acceptance criteria

The slice is complete when:

1. a clean database can apply all migrations and run the seed repeatedly;
2. two documented test users and five or six rooms exist without duplicates;
3. registration validates input, hashes passwords with Argon2id, and redirects
   to login without creating a session;
4. login returns generic credential errors and creates an opaque stateful
   session on success;
5. only hashes of session and CSRF secrets persist;
6. idle and absolute expiry behave exactly as specified through the injected
   clock;
7. session restoration survives page reload;
8. logout revokes only the current session and clears its cookies;
9. protected web and API routes reject anonymous or expired sessions;
10. authenticated users can view the responsive, accessible room list;
11. OpenAPI and generated TypeScript contracts are current;
12. expected errors use stable codes and request IDs without secret leakage;
13. focused unit, PostgreSQL integration, component, and Playwright tests pass;
14. README explains setup, seeding, and local test credentials;
15. capacity filtering, calendar behavior, and email verification remain
    outside the slice.

## 13. Implementation constraints and risks

- New runtime dependencies must be justified and checked against current
  official documentation before they are added.
- Password hashing parameters must balance security with acceptable local and
  CI test time; tests may use dependency injection for a faster test-only
  hasher without changing production parameters.
- Sliding idle expiry adds a database write to successful authenticated
  requests. This is accepted for the current product scale and avoids an
  unapproved cache or broker.
- Server-rendered authentication must never cache one user's session result for
  another request.
- Unique constraints, not pre-checks, remain authoritative under concurrent
  registration.
- Existing foundation behavior and unrelated user work must be preserved.

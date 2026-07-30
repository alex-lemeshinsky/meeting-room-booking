# Engineering Invariants

Read this guide before application, API, database, time, authentication,
contract, dependency, or infrastructure work. It supplements the root
[AGENTS.md](../../AGENTS.md).

## Architecture

- Use a pnpm workspace monorepo: `apps/web`, `apps/api`, and `packages/*`.
- `apps/web` is Next.js App Router; `apps/api` is a separate NestJS API.
- PostgreSQL is the source of truth; Prisma owns data access and migrations.
- nginx is the same-origin proxy. Do not add browser CORS without a reason.
- Next.js must not import Prisma, access the database, or own domain rules.
- NestJS owns auth, validation, bookings, recurrence, and notifications.
- Generate public TypeScript contracts from OpenAPI, never Prisma models.
- Keep dependencies directed: Auth → Users; Bookings → Users and Rooms;
  Recurrence → Bookings; Notifications → Bookings. Do not introduce cycles.
- Build the calendar grid in-house; do not add ready-made calendar widgets.

## Time, booking, and authentication

- Store instants in UTC. Evaluate office hours as `09:00–19:00 Europe/Kyiv`
  and display them in the user's IANA timezone.
- Centralize time logic in `packages/time`; inject `Clock`; never use fixed
  offsets or hand-written date arithmetic for timezone rules.
- Use half-open intervals `[start, end)`.
- PostgreSQL exclusion constraints are the final overlap/race guarantee.
- Create recurring series atomically; never leave a partial series.
- Use Argon2id and opaque stateful sessions; never persist raw secret tokens.
- Do not add Redis or a broker without an approved architecture change.
- PostgreSQL is durable notification state; SSE is only a delivery channel.

## Dependencies

Before adding a dependency, verify need, maintenance, official documentation,
and bundle/runtime impact. Prefer an existing abstraction when it fits.

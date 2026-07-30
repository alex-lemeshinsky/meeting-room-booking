# Verification Guide

Read this guide before testing, verification, browser checks, integration, E2E,
CI, or release work. It supplements the root [AGENTS.md](../../AGENTS.md).

## Gates

```text
pnpm verify:fast
pnpm verify:all
```

Use a verification pyramid. During edits, run the smallest focused command that
proves the changed behaviour. Run `pnpm verify:fast` once after each coherent
code slice, before handoff or commit. Run `pnpm verify:all` when the slice
changes database integration or migrations, concurrency, critical desktop or
mobile journeys, release/CI configuration, or the relevant integration/E2E
harness; it remains the final gate for a release-sized change. Documentation-
only changes need formatting and repository-policy checks unless they alter a
command or requirement covered by a stronger gate.

`pnpm verify:fast` runs the deterministic repository, formatting, lint,
typecheck, unit, contract-freshness, and build checks without Docker or a
browser. `pnpm verify:all` adds PostgreSQL integration tests and Playwright.
Focused commands remain available for development and failure diagnosis.
Contract freshness regenerates public contracts before comparing them, so a
local verification can modify generated files in the working tree.

If a command does not exist in an early phase, report the missing harness; add
it only in the appropriate foundation slice. Never claim an unrun check.

## Test evidence

Unit-test policies, overlaps, time rules, and permissions. Integration tests
must run the full NestJS app against PostgreSQL via Testcontainers; SQLite or
mocks do not prove migrations, transactions, or exclusion constraints. Prove
races with one `201`, one `409`, and one active database row. Test series
rollback, notification idempotency, cancellation, and both DST folds.

Use Playwright for critical desktop and mobile journeys. Inspect loading, empty,
error, timezone, and responsive states in a real browser.

## User-facing feature validation

After completing a full user-facing feature, launch the project in development
mode and validate that feature end to end in the in-app `Browser` plugin.
Exercise both desktop and mobile viewports, including a happy path and an error
path. Confirm the feature's logic and user-visible information are correct;
there are no unexpected application or browser-console errors; and the
responsive layout is clear, usable, and free of visual defects, leaked
system/internal titles, or other unintended UI text. Treat this as a completion
gate in addition to the automated checks. The main agent must investigate and
automatically fix any errors found during this Browser validation, then rerun
the affected scenario and relevant automated checks until they pass. Report the
exact scenarios, fixes, and results in the handoff.

Every bug fix gets a regression test at the lowest reliable layer. Never disable
or weaken a test, lint, migration, or constraint to make a run green. Remove
debug output, dead code, and accidental generated artifacts.

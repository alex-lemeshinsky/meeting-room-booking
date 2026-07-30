# Documentation, Git, and Handoff Guide

Read this guide before documentation, Git, commits, handoff, secret handling,
or failure-recurrence work. It supplements the root [AGENTS.md](../../AGENTS.md).

## Documentation and task records

- behavior or scope → `docs/features.md`;
- boundaries or technology → `docs/architecture.md`;
- setup or operations → `README.md`;
- approved designs, implementation plans, and working notes →
  `docs/superpowers/` (not versioned; it is Git-ignored).

Keep the full design, plan, and working notes in `docs/superpowers/` so they
persist across task-context compaction. Preserve the reviewable operational
context in the pull request's `Handoff` template instead: scope, acceptance
criteria, exact verification evidence, unverified items, known risks, and the
next smallest slice. For a direct commit with no pull request, put the same
concise handoff in the commit body or the task handoff message. Never copy
private plans, credentials, tokens, cookies, or secrets into either artifact.

Never rewrite a source-of-truth document after the fact merely to justify
divergent code. Get approval before changing agreed product or architecture.

## Git and safety

Before committing, review `git diff`, run `git diff --check`, and exclude
unrelated files. Commit one verified coherent slice; avoid mixed or `WIP`
commits. Preserve the meaningful history required by the project brief.

Preserve user changes and inspect targets before destructive actions. Never
commit secrets or log passwords, cookies, session, CSRF, or verification tokens.
Validate untrusted data at system boundaries.

## Handoff and recurrence

Handoff must use the durable format above and state what changed, satisfied
criteria, exact checks and results, anything unverified, known risks, and the
next smallest slice.

Do not declare completion while criteria are unmet, relevant gates fail,
documentation is stale, or Git state is unclear.

When a failure repeats, improve the harness in this order: test, static
check/lint, actionable script, focused source-of-truth documentation, then an
`AGENTS.md` rule only when the earlier options do not fit.

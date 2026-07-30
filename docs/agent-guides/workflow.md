# Agent Workflow Guide

Read this guide before any repository change, fresh setup, planning, or parallel
work. It supplements the root [AGENTS.md](../../AGENTS.md).

## Environment preflight

In a fresh environment, activate the checked-in Node.js version, install the
pinned pnpm version, create `.env` from `.env.example` when absent, and run
`npm run doctor:fast` before pnpm commands. Run `npm run doctor:full` before
Docker, integration, or E2E work.

## Work protocol

```text
orient → specify → plan → execute → verify → self-review → commit → handoff
```

Before changes, state the goal, non-goals, observable acceptance criteria,
verification commands, and risks to data, time, security, or compatibility.

Select the lightest delivery tier that preserves confidence:

1. **Local change** — a small, contained edit with no schema, public contract,
   security, time-rule, or cross-module impact. Record a short in-session
   acceptance contract and run focused checks.
2. **Bounded feature** — a coherent change confined to one module boundary,
   with no migration, public-contract, security-policy, or concurrency impact.
   Record a compact acceptance brief: scope, non-goals, affected files,
   observable criteria, and focused checks. Use one focused self- or
   peer-review for the completed slice.
3. **Material change** — a cross-module change, migration, security-sensitive
   flow, time rule, public contract, concurrency guarantee, or architectural
   decision. Record an approved design specification and a task-by-task plan in
   the ignored `docs/superpowers/` folder. The plan states goal, architecture,
   constraints, exact file changes, interfaces, focused tests, verification
   commands, and coherent commits.

For a material plan, use `superpowers:subagent-driven-development` only when
tasks are independently reviewable and high-risk. Otherwise execute the plan
inline with `superpowers:executing-plans`; bounded work does not require a
per-task subagent/reviewer loop. Keep progress and verification evidence in the
brief or plan. Do not use `docs/plans` or create duplicate progress files. Do
not implement against an unapproved specification when the work requires one.

Do not one-shot the project, skip an unfinished slice, expand scope without
approval, guess external state, or overwrite unrelated work.

## Parallel work

Parallel agents are allowed only for independent tasks with explicit file
ownership and expected evidence. Two agents must not edit the same files; the
coordinator owns integration, full diff review, and final gates.

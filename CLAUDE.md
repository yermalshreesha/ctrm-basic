# CTRM-Basic

Learning project: a basic agricultural CTRM (trades, logistics,
inventory, dashboard). Single user, no login, runs locally.

## Source of truth
- intent/intent.md: what we want and why
- intent/spec.md: requirements and design decisions. Do not add
  features that are not in the spec.
- intent/plan.md: the current implementation plan (once it exists)
If the code needs to depart from the spec or plan, stop and ask.
When the implementation changes the plan, update plan.md in the
same commit.

## Stack
- frontend/: React + TypeScript (Vite)
- backend/: Node.js + Express + TypeScript
- Prisma with PostgreSQL; npm workspaces in one repo

## Commands
To be filled in once the project is scaffolded (install, dev,
test, lint, database migrate).

## Conventions
- Follow the ctrm-standards skill.
- All stock changes go through the inventory service, inside a
  database transaction.

## Environment
- The developer is on Windows and uses Command Prompt (cmd).
  Give cmd-compatible commands (no `mkdir -p`, no `rm -rf`),
  or use npm scripts that work on any OS.

## Verifying your work
Run the tests and lint before reporting a task complete, and show
the output. If a test fails, fix the code, not the test.

## Things Claude gets wrong
(Empty for now. When Claude makes the same mistake twice, add it here.)
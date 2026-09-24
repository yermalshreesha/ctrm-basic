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
Run all of these from the repo root (npm workspaces).

- Install: `npm install`
- Start database (Postgres in Docker, `ctrm_dev` + `ctrm_test`): `npm run db:up`
  (stop with `npm run db:down`)
- Dev (backend + frontend together): `npm run dev`
  - Backend alone: `npm run dev -w backend` (Express on port 3001,
    `GET /api/health`)
  - Frontend alone: `npm run dev -w frontend` (Vite)
- Build everything: `npm run build`
- Test (backend, against the real `ctrm_test` database): `npm test`
- Lint (both workspaces): `npm run lint`
- Migrate dev database: `npm run db:migrate`
- Seed dev database: `npm run db:seed`
- Apply pending migrations to the test database (non-destructive; run
  this after schema changes): `npm run db:test:migrate`
- Reset test database (drops/recreates against `ctrm_test`; use only
  if the test database is broken, e.g. out of sync in a way
  `db:test:migrate` can't fix): `npm run db:test:reset`

Requires Docker Desktop running and the database up (`npm run db:up`)
before `npm test`, `npm run dev -w backend`, or any `db:*` command.
Copy `.env.example` to `.env` on first setup (already done in this repo).

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
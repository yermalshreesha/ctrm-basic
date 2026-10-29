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
  - Backend alone: `npm run dev -w backend` (Express on the port from
    `.env`'s `PORT`, default 3002, `GET /api/health`)
  - Frontend alone: `npm run dev -w frontend` (Vite)
- Build everything: `npm run build`
- Test (backend, against the real `ctrm_test` database): `npm test`
- Lint (both workspaces): `npm run lint`
- Typecheck (both workspaces, no emit): `npm run typecheck`
- Generate the Prisma client from the schema (rarely needed by hand —
  `db:migrate` and `db:test:migrate` already do this as part of
  running): `npm run db:generate`
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
- Bug fixes use a `fix/...` branch. Write the failing test first, in a
  new file under `backend/test/regressions/` or
  `frontend/test/regressions/` (never an edit to an existing test
  file — a guardrail hook locks every already-committed test file on a
  `fix/` branch from the start, precisely to prevent that), commit it,
  then fix the application code. If a fix turns out to need an
  existing test changed, that's a behavior change, not a bug fix: move
  it to a `change-NNN` branch with an `intent/changes/` doc instead.
- Guardrail hooks in `.claude/settings.json` (scripts under
  `.claude/hooks/`) block or pause a few mistakes a session has made
  before: editing a committed migration, stopping/removing the
  Postgres container or backgrounding a dev server, editing a
  committed test file on a `fix/` branch, and running `prisma migrate
  reset`/`db:test:reset` (this one pauses for approval instead of
  blocking). The `fix/` branch test lock covers any file under
  `backend/test/` or `frontend/test/`, so test harness files like
  `test/setup.ts` are locked too, not just `*.test.ts` files. See
  `intent/changes/007-guardrail-hooks.md` and `intent/plan.md` Phase
  16 for why.

## Environment
- The developer is on Windows and uses Command Prompt (cmd).
  Give cmd-compatible commands (no `mkdir -p`, no `rm -rf`),
  or use npm scripts that work on any OS.
- The project uses Prisma 6. The VS Code Prisma extension may flag
  `url = env("DATABASE_URL")` in schema.prisma as an error because it
  targets Prisma 7. This is expected: do not change the schema or
  upgrade Prisma to silence it.
- Another project's PostgreSQL already uses port 5432. This project
  uses port 5433.
- The kr-prolines frontend often uses port 5173, so this project's
  frontend may run on 5174. Don't hard-code the frontend port.
- kr-prolines' backend defaults to port 3001, so CTRM's backend uses
  3002 instead (`.env`'s `PORT`) to avoid a clash when both run at
  once.
- This project uses npm only (package-lock.json). Never run pnpm
  here, even though kr-prolines uses it.
- The production start command (`backend/scripts/start-prod.mjs`,
  see `intent/plan.md` Phase 18) runs `prisma` and `tsx` to migrate
  and seed the database before starting the server. Both are
  `devDependencies`, not `dependencies` — the deploy host's install
  step must not omit dev dependencies (plain `npm ci`, never `npm ci
  --omit=dev`), or the app builds fine but fails every boot.
- `render.yaml`'s `buildCommand` (`intent/plan.md` Phase 19) is `npm
  ci --include=dev && npm run db:generate && npm run build`, not the
  simpler `npm ci && npm run build`, for two reasons: (1) Render sets
  `NODE_ENV=production` for the build, and under that env a plain
  `npm ci` skips `devDependencies` regardless — `--include=dev`
  overrides that; (2) a clean `npm ci` does not generate the Prisma
  client, so `db:generate` must run explicitly before `build`/start.
  Skipping either makes the build succeed but every boot fail.

## Verifying your work
Run the tests, lint, AND typecheck (`npm test`, `npm run lint`,
`npm run typecheck`) before reporting a task complete, and show the
output. If a test fails, fix the code, not the test.

## Reviews
- Reviews follow REVIEW.md at the project root.
- A reviewer never modifies files; it only reports findings.

## Continuous integration
`.github/workflows/ci.yml` runs on every pull request to `main` and
every push to `main`: it spins up a Postgres 16 service container
with a `ctrm_test` database, generates the Prisma client, applies
migrations with `prisma migrate deploy` (never reset), then runs
`npm test`, `npm run lint`, and `npm run typecheck`. A green run there
is the bar for merging.

## Things Claude gets wrong
(Empty for now. When Claude makes the same mistake twice, add it here.)
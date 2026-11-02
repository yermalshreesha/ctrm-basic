# Change: Verifier subagent
Requested by: Yermal Udaya Shreesha   Date: 02-11-2026
Status: draft

## What they asked for
After every build I run npm test, lint, and typecheck by hand. I want
a read-only verifier subagent (.claude/agents/verifier.md) that runs
all three and reports pass/fail in plain words, with the failing test
names or error lines.

## Details
- New subagent: `.claude/agents/verifier.md`.
- Runs `npm test`, `npm run lint`, and `npm run typecheck`.
- Reports pass/fail per command in plain words, including failing
  test names or error lines when something fails.

## Affects existing
None.

## Out of scope
It never edits code, never fixes anything, never deploys, never
touches the database, and does not change reviewer.md or REVIEW.md.

## Open questions
- Backend tests use the Docker Postgres (port 5433). Wording:
  "never changes the database itself; tests may use the test DB."
- If the DB container isn't running, the verifier should report
  "DB not running" and stop. It must never start or stop
  containers itself.
- Tool limits: allow only running npm test, npm run lint and
  npm run typecheck. No Edit or Write.
- Confirm the script names exist in package.json (lint,
  typecheck).
- Should CLAUDE.md say "use the verifier after every build"?

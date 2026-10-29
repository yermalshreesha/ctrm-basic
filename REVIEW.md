# Review instructions

## Passes
Run three passes and tag each finding with its pass:
- Bugs: logic errors, edge cases, two requests at the same time,
  errors that escape as 500s
- Security: secrets in code or logs, unvalidated input, error
  details leaked to users
- Compliance: the change matches intent, spec.md, plan.md,
  CLAUDE.md and the ctrm-standards skill

## Always check
- Search for Number(, parseFloat, parseInt, toFixed, new Date( and
  type="number" used on quantities, prices or dates
- Each test asserts what its name claims and would fail if the
  behavior broke
- Migrations are new files, never edits; nothing deletes data
- Migrations must be additive: never drop or rename something old code
  still uses in the same release (rollback can't undo a migration, so
  a non-additive one breaks the reverted code — see intent/plan.md
  Phase 22)
- plan.md and spec.md are updated if the change departs from them
- CLAUDE.md is still accurate after this change
- List every existing test that was modified or deleted, and check
  the change's intent allows it. Flag any test made weaker.

## What Important means here
Important: breaks behavior, leaks data, breaks a business rule, or
moves stock incorrectly. Style and naming are nits.

## Limits
Report at most five nits; summarize the rest as a count.

## Do not report
node_modules, package-lock.json, generated Prisma files, and
anything CI already enforces (lint, typecheck).
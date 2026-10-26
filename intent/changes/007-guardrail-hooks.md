# Change: Guardrail hooks
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: done

## What they asked for
Some rules in CLAUDE.md and the skills were broken anyway: an applied
migration was edited, the database container was removed during a
review, and dev servers were started in the background. A written
rule only makes these rare; we want them blocked.

## Details
- Hooks in .claude/settings.json (shared with everyone through Git).
- Hook 1: block editing an existing migration file. Creating a new
  migration is still allowed.
- Hook 2: block commands that stop or remove the database containers,
  and starting dev servers in the background.
- Hook 3: during a bug fix, block edits to test files.
- Every block explains the reason and what to do instead.
- Hooks must work on Windows.

## Affects existing
How Claude Code sessions behave in this project. No app code, data or
tests change.

## Out of scope
- Approval gates for production (part of deployment, change 008).
- Hooks that run lint or tests automatically after edits.

## Open questions
- How does hook 3 know a bug fix is in progress? **Resolved:** the
  current branch name starts with `fix/`. Since that locks every
  already-committed test file from the start of the branch, a new
  failing test for the fix goes in a new file under
  `backend/test/regressions/` or `frontend/test/regressions/`, never
  an edit to an existing test file; an existing test genuinely needing
  to change is a behavior change and belongs on a `change-NNN` branch
  with its own intent doc instead. See `intent/plan.md` Phase 16 and
  CLAUDE.md's Conventions section.
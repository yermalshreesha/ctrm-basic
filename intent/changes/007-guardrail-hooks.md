# Change: Guardrail hooks
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: in progress

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
- How does hook 3 know a bug fix is in progress?
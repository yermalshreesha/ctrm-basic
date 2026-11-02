# Change: Intent template skill
Requested by: Yermal Udaya Shreesha   Date: 02-11-2026
Status: draft

## What they asked for
I write a new intent file for every change by hand. Numbers and
sections get mixed up (014/015 got swapped). Claude has also set
Status to done 3 times by itself.

## Details
- New skill: .claude/skills/intent-template/SKILL.md
- When I ask to start a new change, Claude:
  - finds the next number by scanning intent/changes/ filenames
  - creates NNN-short-name.md with the standard sections
  - sets Status: draft
  - asks me for the "why" instead of guessing
  - fills in the real current date, never a placeholder
  - defaults "Requested by" to Yermal Udaya Shreesha, unless I say
    someone else requested it
- CLAUDE.md rule: "Never set an intent's Status to done. Only the
  person does, after merge and verification."
- Asking Claude "start change 017 for X" should create a correct
  file; asking Claude to "finish" a change should get a refusal to
  set Status to done.

## Affects existing
- This change rewrites this file (016) itself into the standard
  format, since it's still a draft on this branch.
- No older intent files are rewritten — their own inconsistencies
  (e.g. date placeholders) are a separate backlog item.

## Out of scope
- No app code changes. No tests change.

## Open questions
None.

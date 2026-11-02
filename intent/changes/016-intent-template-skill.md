# 016 - Intent template skill

Status: draft

## Why
I write a new intent file for every change by hand. Numbers and
sections get mixed up (014/015 got swapped). Claude has also set
Status to done 3 times by itself.

## What
- New skill: .claude/skills/intent-template/SKILL.md
- When I ask to start a new change, Claude:
  - finds the next number in intent/changes/
  - creates NNN-short-name.md with the standard sections
  - sets Status: draft
  - asks me for the "why" instead of guessing
- CLAUDE.md rule: "Never set an intent's Status to done. Only the
  person does, after merge and verification."

## Not in scope
- No app code changes. No tests change.

## Done when
- Asking Claude "start change 017 for X" creates a correct file.
- Claude refuses to set Status to done when asked to "finish" a change.
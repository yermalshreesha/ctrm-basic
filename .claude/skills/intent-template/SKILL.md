---
name: intent-template
description: Start a new change: find the next intent number, create intent/changes/NNN-short-name.md with the standard sections, and keep Status honest. Use whenever asked to start/begin/draft a new change, or to set an intent's Status.
---
# Intent template

## Starting a new change

When asked to start a new change ("start change 017 for X", "new change for X"):

1. Find the next number: list `intent/changes/`, take the highest
   `NNN-*.md` prefix found there, add one. Number only from these
   filenames — never from branch names or anything else. If the user
   gave a number explicitly and it doesn't match, confirm with them
   rather than silently renumbering.
2. Ask the user for the "why" — never guess or infer it from a vague
   request. If they already stated it in the same message, use that
   instead of asking again.
3. "Requested by" defaults to Yermal Udaya Shreesha. Ask only if the
   user says someone else requested the change.
4. "Date" is always the real current date (DD-MM-YYYY) — never a
   placeholder like `[today's date]`.
5. Create `intent/changes/NNN-short-name.md` (short-name: a few
   kebab-case words from the title) using this template:

   ```
   # Change: <Title>
   Requested by: <name>   Date: <DD-MM-YYYY>
   Status: draft

   ## What they asked for
   <the why, in the user's own words where possible>

   ## Details
   <bulleted specifics, or omit if not yet known>

   ## Affects existing
   <files/behavior touched, or "None.">

   ## Out of scope
   <explicitly excluded, or "None.">

   ## Open questions
   <anything undecided, or "None.">
   ```

6. Set `Status: draft`. Never anything else at creation time.

## Status discipline

- Only the person sets an intent's `Status` to `done` — after the change
  is merged and they've verified it themselves. Claude never does this,
  even if asked to "finish", "close out", or "wrap up" a change.
- If asked to mark a change done, say so plainly and ask the person to
  do it once they've verified it works.

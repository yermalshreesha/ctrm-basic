# Change: Scheduled security scan
Requested by: Yermal Udaya Shreesha   Date: [30-10-2026]
Status: done

## What they asked for
Find known security problems in our packages automatically, instead
of only when someone happens to run npm audit.

## Details
- A GitHub workflow runs npm audit every day, and can also be started
  by hand (for demos).
- If it finds high or critical problems, it opens a GitHub issue (or
  updates the existing one, never duplicates), listing what was found.
- It never changes code or packages by itself; fixes go through the
  normal process.
- Minimal permissions: read the code, write issues only.

## Affects existing
Adds one workflow. No app code changes.

## Out of scope
Automatic fixes. Claude Security (needs Enterprise).

## Open questions
None.
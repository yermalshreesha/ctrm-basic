# Change: Production health monitor
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: done

## What they asked for
Notice when production is down without anyone having to check, and
turn the problem into tracked work, following the playbook's
Maintain stage.

## Details
- A scheduled GitHub workflow checks production's /api/health, and
  can also be run by hand.
- Detection is a plain script (no AI). It retries for a few minutes,
  because the free tier needs time to wake up.
- If production is still unhealthy, it opens an "incident" issue
  written in the intent format (problem, evidence, proposed outcome,
  affected systems, open questions), or updates the open one instead
  of duplicating.
- A manual run can simulate a failure (checking a wrong address), for
  demos, without breaking production.
- Claude then drafts a new intent file from the issue, run locally.

## Affects existing
Adds one workflow and one repository variable. No app code changes.

## Out of scope
Automatic fixes. Running Claude inside GitHub (needs an API key).

## Open questions
None.
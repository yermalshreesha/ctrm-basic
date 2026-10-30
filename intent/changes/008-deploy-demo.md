# Change: Deploy CTRM as an online demo
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: done

## What they asked for
Show the CTRM app to others through a link, instead of only on my
laptop, following the playbook's Deploy stage.

## Details
- Two environments: staging (test) and production (demo).
- Hosted on a free platform (Render recommended; confirmed in design).
- Merging to main deploys to staging automatically.
- Production deploys only after a person approves the release.
- Rollback to the previous version is one command, practiced on
  staging before production goes live.
- After each deploy, the health check confirms the app works.
- Settings (database URL, port) are secrets on the host, never in
  the code.

## Affects existing
- Original intent said "runs locally, no login". This makes it
  reachable online, still with no login.
- The frontend must work without the local Vite proxy.

## Risks
- No login: anyone with the link can view and change data. Only fake
  demo data is allowed, and the demo is short-lived.
- Free tier limits: the app sleeps when idle (about a minute to wake),
  and free databases expire after about 30 days.
- Staging and production share one free Postgres server (one instance,
  two logical databases — Render's free tier allows only one instance
  per workspace). They are less isolated than separate instances would
  be: heavy load or a runaway query in staging can affect production's
  performance on the same server, and both environments expire and get
  recreated together rather than independently. Accepted since both
  only ever hold demo data.

## Out of scope
- Login or user accounts.
- Real business data.
- A custom domain name.
- Claude running inside the pipeline (needs an API key; later).

## Decisions
Design covered in full in `intent/spec.md` section 11 (and decisions
7-9 in section 2); implementation split into `intent/plan.md` Phases
17-22. Summary:
- **Databases:** Render's free tier allows only one Postgres database
  per workspace (confirmed against Render's current docs), not two —
  one free instance holds two logical databases, `ctrm_staging` and
  `ctrm_production`, the same pattern already used locally for
  `ctrm_dev`/`ctrm_test`. Both environments expire together; accepted
  since both only ever hold demo data.
- **Demo data reset:** not automated. Only the fixed reference-data
  seed re-runs (idempotently) on every boot; Trade/Shipment/Inventory
  data is never wiped by anything built in this change.
- **Staging deploy trigger:** Render's own `autoDeployTrigger:
  checksPass`, not a GitHub Actions step — deploys once GitHub's CI
  check passes, with no extra pipeline code.
- **Production deploy/approval:** a GitHub Actions job gated on a
  `production` Environment (required reviewer, set up once in GitHub's
  UI) calls the production service's Render deploy hook.
- **Rollback:** two paths — an emergency Render-dashboard rollback done
  by a person (fast, but doesn't touch `main`: the bad commit comes
  back on the next deploy), and `npm run rollback -- <sha>`
  (`scripts/rollback.mjs`), the proper fix, which opens a pull request
  reverting `<sha>` into `main` rather than pushing to `main` directly
  (blocked by branch protection) — re-entering the normal pipeline once
  merged. Full detail and the staging-rehearsal plan are in
  `intent/plan.md` Phase 22. Migrations must be additive
  (expand/contract), since neither rollback path undoes an already-
  applied migration.
- **Smoke test:** Render's `healthCheckPath: /api/health`, gating every
  deploy and rollback natively — no custom polling code required for
  this to work, though Phase 20 adds an optional visibility poll in the
  production workflow run itself.
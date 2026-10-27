# Change: Deploy CTRM as an online demo
Requested by: Yermal Udaya Shreesha   Date: [today's date]
Status: in progress

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
- **Rollback:** `npm run rollback -- <sha>` (`git revert` + push),
  re-entering the normal pipeline rather than a platform-specific
  mechanism.
- **Smoke test:** Render's `healthCheckPath: /api/health`, gating every
  deploy and rollback natively — no custom polling code required for
  this to work, though Phase 20 adds an optional visibility poll in the
  production workflow run itself.
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

## Open questions
- Does the free tier allow two databases (staging and production)?
- Should demo data be reset automatically?
# Change: Separate backend port
Requested by: Yermal Udaya Shreesha   Date: [today's date]

## What they asked for
Run CTRM alongside kr-prolines on the same laptop. Both backends use
port 3001, so CTRM's frontend reaches the wrong app, and the
workaround means editing vite.config.ts by hand every time.

## Details
- The CTRM backend port comes from .env (PORT), default 3002.
- The frontend's dev proxy reads the same setting, so the two always
  match.
- No more editing vite.config.ts by hand.

## Affects existing
- Developers must add PORT to their .env (shown in .env.example).
- CI is not affected (tests don't use a real port).
- No data changes.

## Out of scope
- Changing kr-prolines.
- Production hosting settings (part of change 004, deployment).

## Open questions
None.
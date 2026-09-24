# Implementation plan: CTRM-Basic

## Context

`intent/intent.md` and `intent/spec.md` define a single-user agricultural
CTRM (trades, logistics, inventory, dashboard) with a fully-specified data
model, status-transition rules, 10 business rules (BR-1…BR-10), a REST API
surface, and 4 screens. No code exists yet — only the intent/spec docs and
the `ctrm-standards` skill. This plan turns that spec into a sequence of
small, working phases so the app can be built and verified incrementally,
backend business logic and tests first, UI last, per CLAUDE.md.

**Decisions confirmed with the product owner for this plan (2026-09-24):**
- **Database:** PostgreSQL via Docker Compose (one container, two databases:
  `ctrm_dev` and `ctrm_test`, via `DATABASE_URL` / `TEST_DATABASE_URL`).
  Host port **5433** (not the Postgres default 5432, which is already in
  use by another project's container on this machine) is mapped to the
  container's internal 5432; `DATABASE_URL`/`TEST_DATABASE_URL` connect to
  `localhost:5433`.
- **Backend test runner:** Vitest.
- **Test strategy:** tests run against the real `ctrm_test` Postgres
  database (migrated via Prisma), not a mocked client — this is the only
  way to actually prove the DB-level `CHECK` constraints and transactional
  behavior the spec relies on for BR-2/BR-3/BR-4/BR-4a/BR-10. Tables are
  truncated between tests via a Vitest setup file; `prisma migrate reset`
  is used for a full reset after schema changes. `test/setup.ts` refuses
  to run unless `DATABASE_URL` resolves to `ctrm_test`, so a misconfigured
  `.env` can never cause a truncate against `ctrm_dev`. Since all test
  files share one physical database and truncate between tests, Vitest's
  `fileParallelism` is set to `false` (`vitest.config.ts`) — otherwise
  one file's truncate can race another file's in-flight assertions
  (observed as flaky failures in Phase 1).
- **Build order:** Scaffold → reference data → Trade → **Inventory service
  (3a, standalone)** → **Shipments, calling the inventory service (3b)** →
  Dashboard endpoints → then frontend: scaffold → Trades → Logistics →
  Inventory → **Dashboard screen last**, so its aggregate numbers can be
  visually cross-checked against the Trades/Logistics/Inventory screens
  already in the UI, not just against curl output.
- **Frontend testing:** not covered by the interview (scope was backend
  business-rule testing). Frontend phases rely on manual verification per
  CLAUDE.md's "check in a browser" guidance, plus lint/typecheck; no
  React Testing Library setup is planned unless requested later.

Every phase leaves the app runnable and independently checkable — no phase
depends on a later one to be demonstrable.

---

## Phase 0 — Repo scaffold, Docker Postgres, tooling

**Goal:** npm-workspaces repo with empty but running frontend and backend,
Postgres in Docker (dev + test databases), Prisma initialized, lint/test
harnesses wired end-to-end (proven with one smoke test).

**Files:**
- `package.json` (root, workspaces: `frontend`, `backend`), `.gitignore`
- `docker-compose.yml` — one `postgres` service, init script creating
  `ctrm_dev` and `ctrm_test` databases, host port `5433` mapped to the
  container's `5432` (port 5432 on this machine is already taken by
  another project's Postgres container)
- `.env.example` (`DATABASE_URL`, `TEST_DATABASE_URL`, both pointing at
  `localhost:5433`), `.env` (gitignored)
- `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`
  (Express app + `GET /api/health`), `backend/src/server.ts`
- `backend/prisma/schema.prisma` (datasource + generator only, no models yet)
- `backend/vitest.config.ts`, `backend/test/setup.ts` (test DB connection)
- `backend/eslint.config.js` — flat config, typescript-eslint, type-aware
  only for `src/**` (test/scripts/config files get non-type-checked
  linting so they don't need to be added to `tsconfig.json`'s `include`)
- `frontend/` keeps its Vite-scaffolded `oxlint` lint setup as-is, rather
  than forcing a shared ESLint config onto it — the two workspaces use
  different linters, run together by the root `lint` script
- `frontend/` — standard Vite React-TS scaffold, untouched beyond defaults
- Root npm scripts: `dev`, `build`, `test`, `lint`, `db:up`, `db:down`,
  `db:migrate`, `db:seed`, `db:test:reset`

**Business rules implemented:** none (infrastructure only).

**Tests:**
- One smoke test: `GET /api/health` returns 200, using Vitest + supertest,
  running against `ctrm_test` — proves the whole chain (Vitest → Express →
  Prisma → Postgres container) works before any real logic is written.

**Manual check:**
- `docker compose up -d` brings up Postgres; `psql`/`docker exec` shows
  both `ctrm_dev` and `ctrm_test` databases exist.
- `npm run dev` starts the backend; `curl localhost:<port>/api/health`
  returns 200.
- `npm test` and `npm run lint` pass at the root.

---

## Phase 1 — Reference data: Commodity, Counterparty, Warehouse

**Goal:** seed data and read-only endpoints for the three fixed reference
entities that Trade/Shipment will depend on.

**Files:**
- `backend/prisma/schema.prisma` — add `Commodity`, `Counterparty`,
  `Warehouse` models (per spec §4), first real migration
- `backend/prisma/seed.ts` — seeds a handful of commodities (Wheat,
  Arabica Coffee, Sugar ICUMSA 45, etc.), counterparties, warehouses
- `backend/src/modules/commodities/` — route + service + Zod (or similar)
  schema for `GET /api/commodities`
- `backend/src/modules/counterparties/` — `GET /api/counterparties`,
  `GET /api/counterparties/:id`
- `backend/src/modules/warehouses/` — `GET /api/warehouses`,
  `GET /api/warehouses/:id`

**Business rules implemented:** none directly (BR-9 — fixed reference
data, no mutation endpoints — is satisfied by *not* building create/edit/
delete here). Establishes the schema-validation and error-shape
conventions (404 for missing id) reused by every later module.

**Tests:**
- List endpoints return the seeded rows.
- Get-by-id returns the right row; a well-formed but unknown id returns
  404; a malformed (non-UUID) id returns 400.
- `POST`/`PATCH`/`DELETE` are rejected (404, no route registered) for all
  three entities — Commodity, Counterparty and Warehouse — since all are
  fixed reference data (BR-9). Originally scoped to Counterparty/Warehouse
  only per the BR-9 gap noted below; extended to Commodity too since it's
  equally fixed seed data (spec §4).
- Creating a second Counterparty or Warehouse with a name that already
  exists is rejected by the database's unique constraint on `name`.
- Running `prisma/seed.ts` creates the expected commodities,
  counterparties and warehouses; running it twice creates no duplicates
  (it upserts on the unique `name` field).

**Manual check:**
- `npm run db:seed`, then `curl` each of the three list endpoints and a
  couple of `:id` lookups (valid and invalid id).

---

## Phase 2 — Trade: CRUD and status transitions (DRAFT/CONFIRMED/CANCELLED)

**Goal:** trades can be created, edited while DRAFT, confirmed, and
cancelled. Completion is deferred to Phase 3b since BR-4 needs shipments
to exist to be meaningfully tested.

**Files:**
- `backend/prisma/schema.prisma` — add `Trade` model + `TradeStatus` enum,
  migration
- `backend/src/modules/trades/` — service (create, get, list w/ filters,
  patch, confirm, cancel) + routes + validation schema

**Business rules implemented:** BR-1 (decimal quantity/price), BR-5
(quantity/price > 0), BR-6 (deliveryPeriodEnd ≥ deliveryPeriodStart),
BR-7 (whitelisted transitions: DRAFT→CONFIRMED, DRAFT→CANCELLED,
CONFIRMED→CANCELLED; everything else rejected with 409 naming both
statuses). BR-10's guard is implemented but only trivially testable here
(no shipments exist yet, so cancel from CONFIRMED always succeeds) — full
BR-10 tests land in Phase 3b.

**Tests:**
- Create: valid trade → DRAFT; rejects qty ≤ 0, price ≤ 0, end date before
  start date (400 with field-level messages).
- Confirm: DRAFT with valid fields → CONFIRMED; missing/invalid fields
  rejected.
- Cancel: DRAFT→CANCELLED and CONFIRMED→CANCELLED (no shipments) succeed.
- Invalid transitions rejected: DRAFT→COMPLETED, CANCELLED→anything.
- PATCH only permitted while DRAFT; rejected once CONFIRMED/CANCELLED.
- List filters by `status`, `commodityId`, `direction`.

**Manual check:**
- Via curl/Postman: create a trade referencing seeded commodity/
  counterparty, confirm it, cancel a different one from DRAFT and from
  CONFIRMED; try an invalid transition and see the 409 message.

---

## Phase 3a — Inventory service: ledger, balance, never-negative rule

**Goal:** build the atomic stock-mutation mechanics — ledger + derived
balance, with the never-negative guard — as a standalone service function,
proven directly by tests. Nothing calls it yet; that wiring is Phase 3b.

**Files:**
- `backend/prisma/schema.prisma` — add `InventoryMovement`,
  `InventoryBalance` models/enums (incl. `CHECK (quantityMt >= 0)` on
  `InventoryBalance`), migration
- `backend/src/modules/inventory/service.ts` — the single stock-mutation
  entry point, e.g. `recordMovement({ warehouseId, commodityId,
  shipmentId, quantityMt })`: creates an `InventoryMovement` row and
  upserts the matching `InventoryBalance` row, atomically inside one
  `prisma.$transaction`. A negative `quantityMt` that would take the
  balance below zero is rejected by the service *before* writing anything
  (app-level check), with the DB `CHECK (quantityMt >= 0)` constraint as
  the backstop.
- `backend/src/modules/inventory/routes.ts` — `GET /api/inventory`,
  `GET /api/inventory/movements` (read-only; return empty results until
  Phase 3b starts writing to these tables)

**Business rules implemented:** BR-1 (decimal `quantityMt` on movement and
balance) and the underlying never-negative mechanics that back BR-3 (the
app-level insufficient-stock check plus the DB `CHECK` backstop). Not yet
implemented: BR-2/BR-3's actual trigger conditions ("on shipment delivered
/ departed") — those require the Shipment model and land in Phase 3b.

**Tests:**
- `recordMovement` with a positive `quantityMt` creates a movement row and
  increases the balance (mechanics behind BR-2).
- `recordMovement` with a negative `quantityMt` decreases the balance when
  sufficient stock exists.
- `recordMovement` with a negative `quantityMt` that would take the
  balance below zero is rejected by the app-level check before anything is
  written.
- A direct write that bypasses the app-level check (e.g. inserting a
  movement straight via Prisma without going through `recordMovement`) is
  still rejected by the DB `CHECK (quantityMt >= 0)` constraint — proving
  the backstop independently of the app-level check.
- Balance upsert: first movement for a warehouse+commodity pair creates
  the `InventoryBalance` row; a subsequent movement updates it correctly.

**Manual check:**
- `curl GET /api/inventory` and `GET /api/inventory/movements` both return
  empty arrays (nothing has written to these tables yet).
- Optional: exercise `recordMovement` directly via a throwaway script
  (e.g. `ts-node`) to see a balance increase and a rejected decrease —
  this is a scratch check, not part of the app's permanent surface.

---

## Phase 3b — Shipments: status transitions, calling the inventory service, trade completion/cancellation

**Goal:** the heart of the app — shipments move through
PLANNED→IN_TRANSIT→DELIVERED, and departure/delivery call the Phase 3a
inventory service inside the same transaction as the status update. Trade
completion becomes meaningful and testable here, and BR-10's cancellation
guard becomes fully testable now that shipments exist.

**Files:**
- `backend/prisma/schema.prisma` — add `Shipment` model + enum, migration
- `backend/src/modules/shipments/` — service (create, get, list w/
  filters, patch, depart, deliver) + routes + validation; `depart`/
  `deliver` call `inventory.service.recordMovement(...)` from Phase 3a
- `backend/src/modules/trades/service.ts` — extend with `complete()` and
  the full BR-10 shipment-status check on `cancel()`

**Business rules implemented:** BR-2, BR-3 (both now triggered by
shipment status transitions, not just directly callable), BR-4, BR-4a,
BR-8, BR-10 (full), plus BR-1/5/6/7 applied to Shipment.

**Tests:**
- BR-2: delivering a BUY shipment increases the destination warehouse's
  balance by exactly `quantityMt` and writes a matching movement; no other
  warehouse/commodity balance changes (AC-5, AC-6).
- BR-3: departing a SELL shipment decreases the origin warehouse's balance;
  departing when balance is insufficient is rejected with 409 and doesn't
  mutate state.
- BR-4: completing a CONFIRMED trade succeeds only when every shipment is
  DELIVERED and quantities sum exactly to trade quantity (AC-3); otherwise
  409 (AC-4).
- BR-4a: creating or editing a shipment whose quantity would push the
  trade's shipment total over the trade quantity is rejected with 400
  (AC-4a), both on create and on PATCH.
- BR-8: a shipment's commodity is always read from its trade, never stored
  independently (assert no `commodityId` column / value drift possible).
- BR-10: cancelling a CONFIRMED trade with an IN_TRANSIT or DELIVERED
  shipment is rejected with 409 naming the shipment (AC-4b); cancelling
  with only PLANNED shipments (or none) succeeds.
- Invalid shipment transitions rejected (PLANNED→DELIVERED, DELIVERED→*,
  advancing a shipment whose trade isn't CONFIRMED).

**Manual check:**
- Full lifecycle via curl for one BUY and one SELL trade: create → confirm
  → add shipment(s) → depart (watch `/api/inventory` for a SELL) → deliver
  (watch `/api/inventory` for a BUY) → complete. Inspect
  `/api/inventory/movements` to see the ledger entries. Try departing a
  SELL shipment that would exceed available stock and see the 409.

---

## Phase 4 — Dashboard endpoints

**Goal:** the three read-only aggregate endpoints the dashboard screen
will consume.

**Files:**
- `backend/src/modules/dashboard/` — `GET /api/dashboard/positions`,
  `GET /api/dashboard/inventory-summary`,
  `GET /api/dashboard/shipments-in-progress`

**Business rules implemented:** none new; validates the read model against
BR-1 through BR-10's cumulative effects (AC-7).

**Tests:**
- Positions: equals sum(BUY qty, CONFIRMED+COMPLETED) − sum(SELL qty,
  CONFIRMED+COMPLETED) per commodity; DRAFT/CANCELLED excluded (AC-7).
- Inventory summary matches `InventoryBalance` rows.
- Shipments-in-progress lists only PLANNED/IN_TRANSIT shipments.

**Manual check:**
- Using the trades/shipments created in Phase 3b's manual walkthrough,
  curl all three dashboard endpoints and hand-verify the numbers.

**— Backend is now feature-complete per spec §7. This is a natural
checkpoint before starting the UI. —**

---

## Phase 5 — Frontend scaffold: routing, sidebar, API client

**Goal:** a running React app with the sidebar navigation (Dashboard,
Trades, Logistics, Inventory per standard 6) and empty placeholder pages
wired to the backend's base URL, no real data yet.

**Files:**
- `frontend/src/main.tsx`, `frontend/src/App.tsx` — router setup
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/pages/{Dashboard,Trades,Logistics,Inventory}.tsx` —
  placeholders
- `frontend/src/api/client.ts` — fetch wrapper, base URL from env

**Business rules implemented:** none.

**Tests:** none new (no frontend test framework in scope — see Context).

**Manual check:**
- `npm run dev` (both workspaces), open the app in a browser, click
  through all four sidebar links, confirm no console errors and each page
  renders its placeholder.

---

## Phase 6 — Trades screens

**Goal:** Trades list (table, filters, "New trade") and Trade detail/form
(create, edit while DRAFT, Confirm/Cancel/Complete actions per trade
status, field-level validation errors, BR-10 cancel-blocked messaging).

**Files:** `frontend/src/pages/Trades.tsx`, `frontend/src/pages/
TradeDetail.tsx`, `frontend/src/components/TradeForm.tsx`.

**Manual check:** create, confirm, and cancel a trade entirely through the
UI; trigger a validation error (e.g. price = 0) and confirm it renders
next to the field, not as a generic alert.

---

## Phase 7 — Logistics (Shipment) screens

**Goal:** Logistics list (filters by status/warehouse) and Shipment
detail/form (create under a trade, Depart/Deliver actions, BR-4a and BR-3
errors shown as field-level errors on quantity, per spec §8).

**Files:** `frontend/src/pages/Logistics.tsx`, `frontend/src/pages/
ShipmentDetail.tsx`, `frontend/src/components/ShipmentForm.tsx`.

**Manual check:** run a full BUY and SELL trade lifecycle through the UI
only (no curl), watching the Inventory screen (Phase 8) or `/api/inventory`
update after Depart/Deliver.

---

## Phase 8 — Inventory screen

**Goal:** current stock table (warehouse × commodity × MT) plus the
movements ledger below it, per spec §8.

**Files:** `frontend/src/pages/Inventory.tsx`.

**Manual check:** after Phase 7's UI walkthrough, confirm the Inventory
screen's balance and ledger match what was expected from the shipments
just run through the UI.

---

## Phase 9 — Dashboard screen

**Goal:** live dashboard matching spec §8 — net position table, inventory-
by-warehouse table, shipments-in-progress table. Built last among the
screens so its aggregate numbers can be visually cross-checked against the
Trades, Logistics and Inventory screens already built in Phases 6–8, not
just against curl output.

**Files:** `frontend/src/pages/Dashboard.tsx` and small table components
under `frontend/src/components/`.

**Manual check:** compare on-screen numbers against the curl output from
Phase 4's manual check, and against the trades/shipments/inventory visible
on the Trades, Logistics and Inventory screens.

---

## Cross-cutting, applies to every phase

- Every mutation endpoint validates its input against a schema (standard
  5) before touching the database.
- Every stock-mutating operation goes through the Phase 3a inventory
  service function (called from Phase 3b's shipment transitions), inside
  a `prisma.$transaction` — never inlined elsewhere (per CLAUDE.md
  conventions).
- `npm run lint` and `npm test` (backend) must pass before a phase is
  considered done; this plan's "Tests" section per phase maps directly to
  spec §9's acceptance criteria and AC-8's "every BR has a test." `npm
  run lint` runs backend ESLint and frontend oxlint together via
  `npm run lint --workspaces --if-present` from the root — there is no
  single shared lint config across the two workspaces (see Phase 0).
- If implementation needs to depart from spec.md or this plan, stop and
  ask rather than improvising — per CLAUDE.md.

---

## Business rule → phase → test coverage map

| Rule | What it requires | Phase(s) | Test that proves it | Flag |
|---|---|---|---|---|
| BR-1 | Quantities/prices stored as fixed-point decimals, never float | 2 (Trade), 3a (Inventory), 3b (Shipment) | *None dedicated.* Existing tests check validation (rejects ≤ 0), not decimal precision itself. | ⚠️ **No test.** Add a case with a fractional value (e.g. `12.345` MT) that round-trips through create/get exactly, proving no binary-float rounding. |
| BR-2 | BUY shipment → DELIVERED increases stock at the destination warehouse | 3b (trigger), 3a (mechanics) | Phase 3b: "delivering a BUY shipment increases destination balance by exactly `quantityMt`, matching movement written, no other balance changes" (AC-5, AC-6) | — |
| BR-3 | SELL shipment → IN_TRANSIT decreases stock at the origin warehouse, rejected if insufficient | 3a (mechanics/backstop), 3b (trigger) | Phase 3a: app-level rejection + DB `CHECK` backstop test. Phase 3b: departing a SELL shipment decreases balance; insufficient stock → 409, no mutation | — |
| BR-4 | Trade completion requires every shipment DELIVERED and qty sum == trade qty | 3b | "Completing succeeds only when all DELIVERED and sum == qty; otherwise 409" (AC-3, AC-4) | — |
| BR-4a | Shipment qty sum must never exceed trade qty, checked on every create/edit | 3b | "Create/edit shipment exceeding trade qty rejected 400" (AC-4a) | — |
| BR-5 | No negative or zero quantities/prices | 2 (Trade), 3b (Shipment) | Phase 2: "rejects qty ≤ 0, price ≤ 0" on Trade. | ⚠️ **No test.** Phase 3b's test list has no explicit `Shipment.quantityMt ≤ 0` rejection case — add one. |
| BR-6 | Date ordering: `deliveryPeriodEnd ≥ deliveryPeriodStart` (Trade), `plannedArrivalDate ≥ plannedDepartureDate` (Shipment) | 2 (Trade), 3b (Shipment) | Phase 2: "rejects end date before start date" on Trade. | ⚠️ **No test.** Phase 3b's test list has no explicit Shipment date-ordering case — add one. |
| BR-7 | Only whitelisted status transitions permitted, others rejected with a clear error | 2 (Trade), 3b (Shipment) | Phase 2: "invalid transitions rejected: DRAFT→COMPLETED, CANCELLED→anything". Phase 3b: "invalid shipment transitions rejected (PLANNED→DELIVERED, DELIVERED→*, trade not CONFIRMED)" | — |
| BR-8 | A shipment's commodity is always read from its trade, never stored independently | 3b | "assert no `commodityId` column / value drift possible" — a structural/type-level assertion rather than an HTTP integration test | — |
| BR-9 | Commodity/Counterparty/Warehouse are fixed seed data — no create/edit/delete API | 1 | Phase 1: `POST`/`PATCH`/`DELETE` rejected (404) on all three entities' endpoints; duplicate-name creates rejected by the DB unique constraint; seed script is idempotent. | — |
| BR-10 | Trade cancellation blocked once any shipment is IN_TRANSIT or DELIVERED | 2 (trivial case, no shipments yet), 3b (full) | Phase 2: cancel succeeds with no shipments. Phase 3b: "cancelling with an IN_TRANSIT/DELIVERED shipment rejected 409 naming it" (AC-4b); "cancelling with only PLANNED shipments succeeds" | — |

**3 rules still flagged with a test gap: BR-1, BR-5, BR-6.** Each has a
phase that implements it, but the phase's test list as currently written
doesn't include a case that directly proves it. Recommend adding the
listed test cases to the named phase before marking that phase done.
(BR-9's gap was closed in Phase 1 — see above.)

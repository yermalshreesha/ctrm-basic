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
- `backend/prisma/migrations/20260924150000_add_trade_check_constraints/` —
  hand-written SQL migration (not derivable from schema.prisma, which has
  no CHECK-constraint attribute): `quantityMt > 0`, `price > 0`,
  `deliveryPeriodEnd >= deliveryPeriodStart` as DB-level backstops for
  BR-5/BR-6, added after an independent review of this phase.
- `backend/src/modules/trades/` — service (create, get, list w/ filters,
  patch, confirm, cancel) + routes + validation schema. `quantityMt`/
  `price` accept only strings (a JSON number is rejected 400); positivity
  is checked on the digit string, never via `Number(value) > 0`.

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
- Invalid transitions rejected via the endpoints that exist in this
  phase (`confirm`, `cancel`): confirming an already-CONFIRMED trade,
  confirming a CANCELLED trade, cancelling an already-CANCELLED trade —
  each 409, naming both statuses. `DRAFT→COMPLETED` and other
  `COMPLETED`-related transitions can't be exercised over HTTP until
  Phase 3b adds the `/complete` endpoint; their tests land there.
- PATCH only permitted while DRAFT; rejected once CONFIRMED/CANCELLED.
- A `status` field in a PATCH body is ignored — status only changes via
  `confirm`/`cancel`.
- Create/PATCH with a well-formed but nonexistent `commodityId` or
  `counterpartyId` is rejected 400 with a field-level error, not 500.
- `quantityMt` with more than 3 decimals, or `price` with more than 2,
  is rejected 400, not rounded (no trade is persisted).
- `quantityMt` with more than 9 integer digits, or `price` with more than
  10 (the digits DECIMAL(12,3)/DECIMAL(12,2) allow before the decimal
  point), is rejected 400, not truncated — added after an independent
  review of Phase 3a found the same gap in Phase 3a's `quantityMt` and,
  by inspection, here too: a value that passed the decimal-place check
  but had too many integer digits reached Postgres as a raw "numeric
  field overflow" (a 500), not a field-level validation error.
- `quantityMt` and `price` round-trip exactly through create/get and
  are always returned as fixed-scale strings (e.g. `"300.00"`, not
  `"300"`) — proves BR-1 end to end, including the case where Prisma's
  `Decimal.toString()` would otherwise normalize away trailing zeros.
- PATCH changing only `deliveryPeriodEnd` (or only `deliveryPeriodStart`)
  to conflict with the other, already-stored date is rejected 400, with
  the error attached to whichever field the client actually submitted
  (not always `deliveryPeriodEnd`).
- `quantityMt`/`price` sent as a JSON number (not a string) is rejected
  400 with a field-level error, nothing persisted.
- `deliveryPeriodStart`/`deliveryPeriodEnd` round-trip through create/get
  as `"YYYY-MM-DD"` strings, not full timestamps.
- An unexpected error thrown inside a route handler (e.g. a DB call
  rejecting) never reaches the client with internal details — it's
  caught by the global error handler (see Cross-cutting) and returns a
  generic 500.
- PATCH on an unknown id returns 404; on a malformed id, 400.
- List filters by `status`, `commodityId`, `direction`.

**Manual check:**
- Via curl/Postman: create a trade referencing seeded commodity/
  counterparty, confirm it, cancel a different one from DRAFT and from
  CONFIRMED; try an invalid transition and see the 409 message.

**Implementation notes (decided during Phase 2, not departures from
the plan's intent, but resolving ambiguity in the wording above):**
- `GET /api/trades/:id` does not return a `shipments` key in this
  phase — the `Shipment` model doesn't exist until Phase 3b, which is
  when this endpoint starts including it, per spec §7.
- The test database schema must be kept in sync manually: after any
  Prisma schema change, run `npm run db:test:migrate` (see Commands in
  CLAUDE.md) before running tests, in addition to `npm run db:migrate`
  for the dev database.
- `decimalField` (the string-not-number, fixed-scale decimal validator
  used for `quantityMt`/`price`) moved from a private helper in
  `trades/schema.ts` to `backend/src/shared/validation.ts`, gaining a
  `maxIntegerDigits` option and an `allowNegative` option — added during
  Phase 3a so Inventory's signed `quantityMt` could reuse it, and then
  used to fix this phase's own integer-digit-overflow gap (see Tests,
  above). Both modules now call the shared helper instead of each
  defining their own.

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
- `recordMovement` with a well-formed but nonexistent `warehouseId` or
  `commodityId` is rejected 400 with a field-level error, not 500 — added
  after an independent review found this path reaching Postgres as an
  unhandled foreign-key-violation error.
- `recordMovement` with a `quantityMt` that has more than 9 integer
  digits (the digits `DECIMAL(12,3)` allows before the decimal point) is
  rejected 400, not truncated — added after the same review found this
  path reaching Postgres as an unhandled "numeric field overflow" error.

**Manual check:**
- `curl GET /api/inventory` and `GET /api/inventory/movements` both return
  empty arrays (nothing has written to these tables yet).
- Optional: exercise `recordMovement` directly via a throwaway script
  (e.g. `ts-node`) to see a balance increase and a rejected decrease —
  this is a scratch check, not part of the app's permanent surface.

**Implementation notes (decided during Phase 3a, not departures from
the plan's intent, but resolving ambiguity in the wording above):**
- `InventoryMovement.shipmentId` is a plain `String`/UUID column with
  no Prisma `@relation` and no DB foreign-key constraint in this
  phase — the `Shipment` model doesn't exist until Phase 3b. It is
  `@unique`: a shipment triggers at most one stock change (its BUY
  delivery or its SELL departure, never both), so a second movement
  for the same `shipmentId` is rejected (see spec.md §4). Phase 3b's
  migration (which creates `Shipment`) adds the FOREIGN KEY constraint
  and the `@relation`, using the same "constraint added in a later
  migration" pattern as `20260924150000_add_trade_check_constraints`.
- `InventoryMovement` has no `updatedAt`, and `InventoryBalance` has a
  composite primary key (`warehouseId`, `commodityId`) instead of a
  separate `id`/`createdAt` — both deliberate exceptions to
  ctrm-standards #2, since the former is an append-only ledger (no row
  is ever updated) and the latter is a derived/materialized row with
  no identity independent of the keys it's derived from. The standard
  itself was updated to document these exceptions.
- `recordMovement` validates its input with a zod schema
  (`recordMovementSchema` in `inventory/schema.ts`) before writing
  anything: `warehouseId`/`commodityId` must be valid UUIDs that exist
  (the same async-refine-against-Prisma approach as
  `trades/schema.ts`'s `commodityIdField`/`counterpartyIdField`), and
  `quantityMt` is bounded to 3 decimal places and 9 integer digits (the
  shared `decimalField`, signed via its `allowNegative` option — see
  Phase 2's implementation notes). Added after an independent review
  found that a nonexistent `warehouseId`/`commodityId` or an oversized
  `quantityMt` reached Postgres unhandled (a raw FK-violation or
  numeric-overflow error, surfacing as a 500) — this was a real gap in
  the service itself, not just something Phase 3b would eventually need,
  since `recordMovement` is directly callable (and directly tested)
  today.
- The service's two `P2002` (unique-constraint) checks — the
  `InventoryBalance` composite primary key, and
  `InventoryMovement.shipmentId` — are unified into one helper,
  `isUniqueConflict(err, fields)`, instead of two separately-written
  checks with slightly different `meta.target` handling.
- `recordMovement`'s balance write is deliberately a `create`-or-
  `update` branch on whether a balance row already exists, not a
  single `prisma.inventoryBalance.upsert()`. Postgres validates a
  `CHECK` constraint against the raw proposed `INSERT` values of an
  `INSERT ... ON CONFLICT DO UPDATE` statement *before* it knows
  whether the conflict branch will even run — so a legitimate decrease
  against an existing balance (e.g. `50 + (-20) = 30`, a valid result)
  was rejected by `upsert()`, because the discarded "insert
  `quantityMt = -20`" proposal alone fails `quantityMt >= 0`, even
  though the actual update would have succeeded. A plain `update` only
  ever validates the real resulting row. Concurrent *first* movements
  for a pair with no existing balance (both taking the `create`
  branch) still race on the primary key; that case is handled with a
  one-shot retry after a caught conflict, not `upsert()`.

---

## Phase 3b — Shipments: status transitions, calling the inventory service, trade completion/cancellation

**Goal:** the heart of the app — shipments move through
PLANNED→IN_TRANSIT→DELIVERED, and departure/delivery call the Phase 3a
inventory service inside the same transaction as the status update. Trade
completion becomes meaningful and testable here, and BR-10's cancellation
guard becomes fully testable now that shipments exist.

**Decisions confirmed with the product owner for this phase
(2026-09-25), recorded in spec.md:**
- `depart`/`deliver` accept an optional `actualDepartureDate`/
  `actualArrivalDate` (`"YYYY-MM-DD"`) in the request body, defaulting to
  today — the server's **local calendar date, not UTC** (see
  `backend/src/shared/dates.ts`'s `localToday()`) — when omitted; a
  future date is rejected, and a deliver date before the shipment's
  `actualDepartureDate` is rejected.
- BR-10 is **tightened**: a CONFIRMED trade can only be cancelled if it
  has no shipments at all, of any status — not just none IN_TRANSIT/
  DELIVERED as originally drafted. A PLANNED shipment now blocks
  cancellation too; the 409 lists all of the trade's existing shipments.
  Shipments are never deleted automatically (not by a cancel attempt, not
  by anything else) — the user must delete PLANNED ones explicitly.
- BR-4's two conditions (quantities sum exactly to trade quantity, AND
  every shipment DELIVERED) are both required together — test both ways
  a completion can fail (sum matches but not all delivered; all delivered
  but sum doesn't match), not just the combined case.
- New endpoint: `DELETE /api/shipments/:id`, allowed only while PLANNED
  (409 otherwise) — this is how a PLANNED shipment blocking a trade
  cancellation gets cleared.

**Files:**
- `backend/prisma/schema.prisma` — add `Shipment` model + enum, migration
- `backend/src/modules/shipments/` — service (create, get, list w/
  filters, patch, depart, deliver, delete) + routes + validation; `depart`/
  `deliver` call `inventory.service.recordMovement(...)` from Phase 3a
- `backend/src/modules/trades/service.ts` — extend with `complete()` and
  the full (tightened) BR-10 shipment-existence check on `cancel()`

**Business rules implemented:** BR-2, BR-3 (both now triggered by
shipment status transitions, not just directly callable), BR-4, BR-4a,
BR-8, BR-10 (full, tightened per the decision above), plus BR-1/5/6/7
applied to Shipment.

**Tests:**
- BR-2: delivering a BUY shipment increases the destination warehouse's
  balance by exactly `quantityMt` and writes a matching movement; no other
  warehouse/commodity balance changes (AC-5, AC-6).
- BR-3: departing a SELL shipment decreases the origin warehouse's balance;
  departing when balance is insufficient is rejected with 409 and doesn't
  mutate state.
- BR-4: completing a CONFIRMED trade succeeds only when every shipment is
  DELIVERED and quantities sum exactly to trade quantity (AC-3); rejected
  409 when quantities sum correctly but not every shipment is DELIVERED;
  rejected 409 when every shipment is DELIVERED but quantities don't sum
  to trade quantity (AC-4).
- BR-4a: creating or editing a shipment whose quantity would push the
  trade's shipment total over the trade quantity is rejected with 400
  (AC-4a), both on create and on PATCH.
- BR-8: a shipment's commodity is always read from its trade, never stored
  independently (assert no `commodityId` column / value drift possible).
- BR-10 (tightened): cancelling a CONFIRMED trade with any shipment —
  PLANNED, IN_TRANSIT, or DELIVERED — is rejected with 409 listing all of
  them (AC-4b); cancelling a trade with no shipments at all succeeds;
  deleting a trade's only (PLANNED) shipment and retrying cancel then
  succeeds.
- Shipment delete (AC-4c): deleting a PLANNED shipment succeeds; deleting
  an IN_TRANSIT or DELIVERED shipment is rejected with 409.
- depart/deliver actual-date handling: omitting `actualDepartureDate`/
  `actualArrivalDate` defaults it to today; a future date is rejected
  (400); an `actualArrivalDate` before the shipment's `actualDepartureDate`
  is rejected (400).
- Invalid shipment transitions rejected (PLANNED→DELIVERED, DELIVERED→*,
  advancing a shipment whose trade isn't CONFIRMED).

**Manual check:**
- Full lifecycle via curl for one BUY and one SELL trade: create → confirm
  → add shipment(s) → depart (watch `/api/inventory` for a SELL) → deliver
  (watch `/api/inventory` for a BUY) → complete. Inspect
  `/api/inventory/movements` to see the ledger entries. Try departing a
  SELL shipment that would exceed available stock and see the 409. Try
  cancelling a CONFIRMED trade with a PLANNED shipment attached (see the
  409 listing it), delete the shipment, then cancel again and see it
  succeed.

**Implementation notes (decided during Phase 3b, not departures from
the plan's intent, but resolving ambiguity in the wording above, or
found by independent review after the phase was first implemented):**
- `completeTrade` and `cancelTrade` (trades/service.ts) both run inside
  a transaction that locks the trade row first (`SELECT ... FOR UPDATE`,
  same pattern as `createShipment`) before reading its shipments —
  without the lock, a shipment could be created concurrently between the
  read and the commit, leaving a COMPLETED trade with a non-DELIVERED
  shipment, or a CANCELLED trade with a shipment attached. Added after
  an independent review of this phase found both gaps; a genuinely
  concurrent test (`cancelTrade` racing `createShipment` on the same
  trade) is in `trades.test.ts`.
- **Known wart, deliberately not fixed now:** `GET /api/trades/:id`'s
  `shipments` array reuses `shipments/service.ts`'s `serializeShipment`
  as-is, which nests a `trade: { id, direction, status }` summary on
  each shipment — duplicating (a slice of) the very trade object the
  array is already nested under. Flagged by an independent review;
  deliberately left as-is rather than changing the response shape
  mid-phase. Revisit when Phase 6 (Trades screens) or Phase 7
  (Logistics screens) defines what the Trade detail screen actually
  needs from a nested shipment — the duplication may just disappear
  once a UI-driven shape is chosen, rather than needing a standalone
  fix.

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

**Implementation notes (decided during Phase 4, not departures from the
plan's intent, but resolving ambiguity in the wording above):**
- `/api/dashboard/positions` returns one row per commodity that has at
  least one CONFIRMED/COMPLETED trade; a commodity with only DRAFT/
  CANCELLED trades (or no trades at all) is omitted entirely rather than
  reported with a zero position — there's no InventoryBalance-style row
  to anchor a zero entry to, unlike inventory-summary.
- `/api/dashboard/inventory-summary` and `/api/dashboard/shipments-in-
  progress` are thin reuses of `inventory/service.ts`'s
  `listBalances`/`serializeBalance` and a new `shipments/service.ts`
  export, `listShipmentsInProgress` (status `in` [PLANNED, IN_TRANSIT]),
  paired with the existing `serializeShipment` — so their shape is
  identical to `GET /api/inventory` and `GET /api/shipments`
  respectively, not a separate dashboard-specific projection.

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
- `frontend/src/api/types.ts` — TypeScript types for the API responses
  later phases will consume (Commodity, Counterparty, Warehouse, Trade,
  Shipment, InventoryBalance, InventoryMovement, DashboardPosition, error
  bodies); `quantityMt`/`price` are typed `string`, never `number` (BR-1)
- `frontend/vitest.config.ts`, `frontend/test/setup.ts` — Vitest +
  React Testing Library harness for the frontend workspace
- `frontend/test/Sidebar.test.tsx`, `frontend/test/client.test.ts` —
  the two tests below

**Business rules implemented:** none.

**Tests:**
- `Sidebar` renders the four nav links (Dashboard, Trades, Logistics,
  Inventory) in that order.
- `apiClient` throws an `ApiError` whose `message` is the backend's own
  error text on a non-2xx response — both the top-level `message` a
  `not_found`-style body carries, and the joined field messages a
  `validation_failed` body carries instead.

**Manual check:**
- `npm run dev` (both workspaces), open the app in a browser, click
  through all four sidebar links, confirm no console errors and each page
  renders its placeholder.

**Implementation notes (decided during Phase 5, not departures from
the plan's intent, but resolving ambiguity in the wording above):**
- **Routing:** `react-router-dom` (added as a new frontend dependency)
  — chosen over a hand-rolled router since Phases 6-7 add detail routes
  (Trade/Shipment detail) that benefit from a real router rather than a
  growing bespoke switch.
- **API wiring in dev:** the backend has no CORS middleware, and adding
  one would be a backend change outside this phase's file list. Instead,
  `frontend/vite.config.ts` proxies `/api/*` to `http://localhost:3001`
  (the backend's fixed port, per CLAUDE.md), so `api/client.ts` calls
  relative `/api/...` paths — no CORS needed, and it works regardless of
  which port Vite itself picks.
- **Proving the wiring works:** the Dashboard placeholder calls the real
  `GET /api/health` via `api/client.ts` on mount and renders
  "Backend: connected/disconnected" — this satisfies the phase goal of
  pages "wired to the backend's base URL" without displaying any real
  business data (Trades/Logistics/Inventory placeholders make no API
  calls, deferred to Phases 6-8).
- **Frontend test framework, added after all:** the Context section
  above (2026-09-24) deferred a frontend test framework "unless requested
  later" — it was, during this phase. `vitest` + `@testing-library/react`
  + `@testing-library/jest-dom` + `jsdom` were added as frontend
  devDependencies; `frontend/vitest.config.ts` mirrors the backend's own
  `vitest.config.ts` (`globals: false`, explicit imports from `"vitest"`
  in every test file). Frontend tests live under `frontend/test/`,
  parallel to the backend's `backend/test/` — not colocated with `src/`
  — and, like the backend's test files, are outside `tsconfig.app.json`'s
  `include`, so `npm run typecheck` doesn't type-check them; `oxlint`
  still lints them. The root `test` script is now
  `npm run test -w backend && npm run test -w frontend`, so `npm test`
  from the repo root runs both.
- **Types file scope:** `api/types.ts` mirrors the shapes each backend
  module's `serialize*` function actually returns (read directly from
  `backend/src/modules/*/service.ts`), not just spec.md's data model —
  e.g. `Shipment` includes the joined `commodityName`/`warehouseName` and
  the nested `trade` summary object `serializeShipment` adds, and error
  bodies are typed as `ApiErrorBody` (`error`, optional `message`,
  optional `fields`, optional `shipmentIds`) to cover every shape the
  backend's error helpers produce. Nothing in this phase's own pages
  consumes these types yet (Dashboard's health check uses the smaller
  `HealthResponse`); they exist for Phases 6-9 to import.

---

## Phase 6 — Trades screens

**Goal:** Trades list (table, filters, "New trade") and Trade detail/form
(create, edit while DRAFT, Confirm/Cancel/Complete actions per trade
status, field-level validation errors, BR-10 cancel-blocked messaging).

**Decisions confirmed with the product owner for this phase
(2026-09-25):**
- **Routes:** `/trades/new` (create) and `/trades/:id` (detail/edit),
  both rendered by `TradeDetail.tsx`, which renders `TradeForm` in
  create/edit mode or a read-only view depending on status. After a
  successful create, the app navigates to the new trade's `/trades/:id`.
- **Shipments on Trade detail (Phase 6/7 boundary):** a CONFIRMED
  trade's detail page shows a plain read-only table of its shipments
  (id, status, quantity, warehouse — already present in `GET
  /api/trades/:id`'s nested `shipments`), with no links (`/logistics/:id`
  doesn't exist until Phase 7) and no "add shipment" action — a note
  says that arrives in Phase 7.
- **List filters** (status/commodity/direction) live in the URL as
  query params (`useSearchParams`), not plain component state, so they
  survive refresh/back-forward.
- **Reference data for dropdowns:** a new
  `frontend/src/api/referenceData.ts` exports `listCommodities()`/
  `listCounterparties()` thin wrappers around `apiClient.get`, used by
  `TradeForm`.
- **Date fields** (`deliveryPeriodStart`/`deliveryPeriodEnd`) use native
  `<input type="date">` — its value is already a `"YYYY-MM-DD"` string
  matching the wire format, so no `Date` object is ever constructed.
  (`quantityMt`/`price` remain text inputs, `inputMode="decimal"`, per
  CLAUDE.md — never `type="number"`, never converted to a JS number.)
- **Non-field errors** (409s: `invalid_transition`, `not_editable`,
  `cannot_complete`, `shipments_exist`) show as a single dismissible
  error banner at the top of the detail page, with the backend's
  `message` shown verbatim — they aren't tied to one form field.
- **No client-side pagination/sorting** on the Trades list — renders
  all rows in the order the API returns (createdAt desc), matching the
  single-user local scope.
- **Edits use an explicit "Save" button** — no autosave.
- **After every action** (Save, Confirm, Cancel, Complete), the detail
  page re-fetches `GET /api/trades/:id` rather than using the action's
  response body — the action endpoints (`patch`/`confirm`/`cancel`/
  `complete`) return a bare `Trade`, without the nested `shipments` the
  detail page also needs to redraw.
- **Cancel and Complete ask for confirmation** (a simple browser
  `confirm()` dialog) before sending the request, since both are
  irreversible.
- **Client-side validation only checks that required fields are
  non-empty** before submit; all business-rule validation (BR-1, BR-5,
  BR-6, etc.) is left entirely to the backend's field-level 400
  responses.
- **Quantities and prices are displayed exactly as the API returns
  them** (e.g. `"300.00"`) — no client-side number formatting,
  rounding, or thousands separators.

**Files:** `frontend/src/pages/Trades.tsx`, `frontend/src/pages/
TradeDetail.tsx`, `frontend/src/components/TradeForm.tsx`,
`frontend/src/api/referenceData.ts`.

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

- **Known tooling gap:** the backend and frontend workspaces are on
  different major versions of Vitest — `backend/package.json` has
  `vitest@^2.1.8`, `frontend/package.json` has `vitest@^5.0.2` (added
  independently in Phase 5). Not a problem for either workspace's own
  tests today (each runs its own config), but the two should be aligned
  to the same major version later, to keep test config/behavior
  consistent across the repo and avoid two sets of Vitest docs/APIs to
  remember.
- A global Express error-handling middleware (`backend/src/shared/
  errorHandler.ts`), registered last in `app.ts`, catches every otherwise-
  unhandled error and returns a generic 500 JSON body with no internal
  details (standard 8) — the real error is logged server-side only. Since
  this project is on Express 4 (not 5), a rejected promise from an async
  route handler is not forwarded to error middleware automatically; every
  async handler is wrapped with `backend/src/shared/asyncHandler.ts` so
  its errors reach `next(err)` and, from there, the global handler.
  Added after an independent review of Phase 2 found async errors were
  going unhandled.
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
| BR-1 | Quantities/prices stored as fixed-point decimals, never float | 2 (Trade), 3a (Inventory), 3b (Shipment) | Phase 2: `quantityMt`/`price` round-trip exactly through create/get as fixed-scale strings; more-than-scale decimals and more-than-9/10-integer-digit values rejected 400, not rounded/truncated. Phase 3a: same round-trip/rejection cases for `quantityMt` on `InventoryMovement`/`InventoryBalance`, including the integer-digit bound. Phase 3b: same round-trip/rejection cases for `quantityMt` on Shipment. Closed for Phases 2, 3a and 3b. | — |
| BR-2 | BUY shipment → DELIVERED increases stock at the destination warehouse | 3b (trigger), 3a (mechanics) | Phase 3b: "delivering a BUY shipment increases destination balance by exactly `quantityMt`, matching movement written, no other balance changes" (AC-5, AC-6) | — |
| BR-3 | SELL shipment → IN_TRANSIT decreases stock at the origin warehouse, rejected if insufficient | 3a (mechanics/backstop), 3b (trigger) | Phase 3a: app-level rejection + DB `CHECK` backstop test. Phase 3b: departing a SELL shipment decreases balance; insufficient stock → 409, no mutation | — |
| BR-4 | Trade completion requires every shipment DELIVERED and qty sum == trade qty | 3b | "Completing succeeds only when all DELIVERED and sum == qty; otherwise 409" (AC-3, AC-4) | — |
| BR-4a | Shipment qty sum must never exceed trade qty, checked on every create/edit | 3b | "Create/edit shipment exceeding trade qty rejected 400" (AC-4a) | — |
| BR-5 | No negative or zero quantities/prices | 2 (Trade), 3b (Shipment) | Phase 2: "rejects qty ≤ 0, price ≤ 0" on Trade. Phase 3b: "rejects quantityMt = 0/negative" on Shipment create and PATCH. | — |
| BR-6 | Date ordering: `deliveryPeriodEnd ≥ deliveryPeriodStart` (Trade), `plannedArrivalDate ≥ plannedDepartureDate` (Shipment), `actualArrivalDate ≥ actualDepartureDate` (Shipment) | 2 (Trade), 3b (Shipment) | Phase 2: "rejects end date before start date" on Trade. Phase 3b: "rejects plannedArrivalDate before plannedDepartureDate" on Shipment create/PATCH; "rejects actualArrivalDate before actualDepartureDate" on deliver; "rejects a future actualDepartureDate/actualArrivalDate" (product owner decision). | — |
| BR-7 | Only whitelisted status transitions permitted, others rejected with a clear error | 2 (Trade), 3b (Shipment) | Phase 2: invalid transitions rejected via confirm/cancel (double-confirm, confirm-after-cancel, double-cancel); `DRAFT→COMPLETED` and other `COMPLETED` cases wait for Phase 3b's `/complete` endpoint. Phase 3b: "invalid shipment transitions rejected (PLANNED→DELIVERED, DELIVERED→*, trade not CONFIRMED)", plus the deferred `DRAFT→COMPLETED` Trade case | — |
| BR-8 | A shipment's commodity is always read from its trade, never stored independently | 3b | "assert no `commodityId` column / value drift possible" — a structural/type-level assertion rather than an HTTP integration test | — |
| BR-9 | Commodity/Counterparty/Warehouse are fixed seed data — no create/edit/delete API | 1 | Phase 1: `POST`/`PATCH`/`DELETE` rejected (404) on all three entities' endpoints; duplicate-name creates rejected by the DB unique constraint; seed script is idempotent. | — |
| BR-10 | Trade cancellation blocked once it has any shipment, of any status (tightened 2026-09-25 — see Phase 3b decisions) | 2 (trivial case, no shipments yet), 3b (full) | Phase 2: cancel succeeds with no shipments. Phase 3b: "cancelling with a PLANNED/IN_TRANSIT/DELIVERED shipment rejected 409 listing all of them" (AC-4b); "cancelling with no shipments succeeds"; "deleting the blocking PLANNED shipment then cancelling succeeds" | — |

**Test gaps: all closed.** BR-9's gap was closed in Phase 1; BR-1 is now
closed across Phases 2, 3a and 3b; BR-5/BR-6 are now closed across
Phases 2 and 3b (see rows above).

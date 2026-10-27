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
  (the backend's fixed port, per CLAUDE.md) (changed in Phase 12: the
  port now comes from PORT in .env), so `api/client.ts` calls
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

**Decisions confirmed with the product owner for this phase
(2026-09-27):**
- **Remaining quantity to ship**, shown on both the Trade detail page and
  the Shipment create/detail page, is computed backend-side, never in the
  browser: `GET /api/trades/:id` now returns a `remainingQuantityMt` field
  (`trade.quantityMt` minus the sum of every one of its shipments'
  `quantityMt`, regardless of shipment status — the same population BR-4a's
  `assertWithinTradeQuantity` sums in `shipments/service.ts` — computed
  from the raw `Prisma.Decimal` values, before serialization). This is a
  small backend touch outside this phase's originally-scoped file list
  (see Files, below); no other Trade endpoint's response shape changes.
- **Trade detail page (Phase 6) gains three things in this phase, rather
  than as a separate Phase 6 revision:** a "Remaining to ship: X MT" line
  and an "Add shipment" link (`/logistics/new?tradeId=<id>`), both shown
  only while the trade is CONFIRMED (replacing the old "Adding shipments
  arrives in Phase 7" note); and the shipments table's rows now link to
  `/logistics/:id`.
- **Routes:** `/logistics` (list), `/logistics/new?tradeId=<id>` (create)
  and `/logistics/:id` (detail/edit), the latter two both rendered by
  `ShipmentDetail.tsx` — same `/trades/new` + `/trades/:id` pattern as
  Phase 6. Visiting `/logistics/new` with no `tradeId`, or with a
  `tradeId` that doesn't exist, shows a clear message instead of the form.
- **Origin/destination auto-fill** (spec §3's warehouse-drift concern):
  selecting a warehouse fills `destination` (BUY trade) or `origin` (SELL
  trade) with the warehouse's name, and keeps doing so on every later
  warehouse change — until the user types into that field themselves, at
  which point it is never overwritten again.
  Fix #13: a loaded shipment whose saved origin/destination already
  differs from its warehouse's name also counts as user-entered, even if
  the user hasn't touched the field in this form instance — otherwise
  editing the shipment and changing the warehouse would silently
  overwrite that saved value.
- **BR-3's insufficient-stock rejection** (`insufficient_stock` — a
  message-only 409, unlike `validation_failed`'s `fields` array) is
  synthesized into a field-level error on `quantityMt` client-side in
  `ShipmentDetail.tsx`, so it renders next to the quantity field exactly
  like BR-4a's 400, per spec §8.
- **State after an action:** Depart/Deliver/Delete/Save update the page
  directly from that action's own response (every Shipment action
  endpoint already returns the full serialized shipment, unlike Trade's
  confirm/cancel/complete) — no extra `GET /api/shipments/:id` re-fetch.
  Save additionally re-fetches `GET /api/trades/:tradeId` afterward, since
  editing a PLANNED shipment's `quantityMt` changes the trade's
  `remainingQuantityMt`.

**Files:** `frontend/src/pages/Logistics.tsx`, `frontend/src/pages/
ShipmentDetail.tsx`, `frontend/src/components/ShipmentForm.tsx`,
`frontend/src/pages/TradeDetail.tsx` (the three additions above),
`frontend/src/api/referenceData.ts` (add `listWarehouses`),
`backend/src/modules/trades/routes.ts` (`remainingQuantityMt` on `GET
/api/trades/:id`), `backend/test/trades.test.ts`.

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

## Phase 10 — Trade notes

**Goal:** add an optional free-text `notes` field to Trade (up to 500
characters, editable only while DRAFT, shown on the Trade detail page),
per `intent/changes/001-trade-notes.md` and spec.md BR-11. A small
single-field change, so backend and frontend are done together in one
phase rather than split, unlike Phases 0–9's backend-first-then-UI
build-out.

**Decisions confirmed with the product owner for this phase
(2026-10-01), recorded in spec.md:**
- Field name is `notes` (not `note`).
- The Trades list table does **not** gain a notes column — the field
  is shown on the Trade detail page only, per the change request's
  explicit scope.
- A whitespace-only `notes` value is trimmed and normalized to `null`
  on both create and `PATCH` — there is no stored distinction between
  "no notes" and "cleared notes."

**Files:**
- `backend/prisma/schema.prisma` — add `notes String?` to the `Trade`
  model, migration.
- `backend/src/modules/trades/schema.ts` — add a `notesField` (trim,
  max 500 characters, empty/whitespace-only transformed to `null`) to
  both `createTradeSchema` and `patchTradeSchema`; a value over 500
  characters is rejected 400 with a field-level error.
- `backend/src/modules/trades/service.ts` — `serializeTrade` (or
  equivalent) includes `notes`; the existing "PATCH only while DRAFT"
  guard already covers it with no new code path, since `notes` is just
  another field on the same patch schema.
- `frontend/src/api/types.ts` — `Trade` type gains `notes: string |
  null`.
- `frontend/src/components/TradeForm.tsx` — a `<textarea>` field for
  `notes` (optional, max 500 characters, grouped per ctrm-standards'
  form conventions), shown while the trade is DRAFT/being created.
- `frontend/src/pages/TradeDetail.tsx` — displays `notes` (when
  non-null) read-only once the trade is no longer DRAFT; no change to
  `frontend/src/pages/Trades.tsx` (list table stays as-is, per the
  decision above).

**Business rules implemented:** BR-11 (trade notes optional, bounded,
DRAFT-only editable).

**Tests:**
- Create/PATCH a DRAFT trade with `notes` up to 500 characters
  succeeds and round-trips exactly through create/get (AC-9).
- Create/PATCH with `notes` over 500 characters is rejected 400 with a
  field-level error; nothing persisted (AC-9).
- A whitespace-only `notes` value on create or `PATCH` is normalized
  and stored/returned as `null` (AC-10).
- Omitting `notes` entirely on create stores and returns `null` (not
  absent from the response body).
- `PATCH` attempting to change `notes` once the trade is CONFIRMED,
  COMPLETED or CANCELLED is rejected, same as any other field edit
  outside DRAFT (AC-11) — extends the existing "PATCH only while
  DRAFT" test rather than adding a new code path.

**Manual check:**
- Create a trade through the UI, type a note, save, and confirm it's
  shown on the detail page; edit it again while still DRAFT; confirm
  the trade and confirm the note is now read-only; confirm the Trades
  list table shows no notes column.

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
| BR-9 | Commodity/Counterparty/Warehouse are fixed seed data — no create/edit/delete API | 1, 11 (Maize rename) | Phase 1: `POST`/`PATCH`/`DELETE` rejected (404) on all three entities' endpoints; duplicate-name creates rejected by the DB unique constraint; seed script is idempotent. Phase 11: `commodityRename.test.ts` confirms the "Corn"→"Maize" rename happens only via a hand-written migration against the existing row (same `id`), never through a create/edit/delete endpoint — BR-9 unaffected. | — |
| BR-10 | Trade cancellation blocked once it has any shipment, of any status (tightened 2026-09-25 — see Phase 3b decisions) | 2 (trivial case, no shipments yet), 3b (full) | Phase 2: cancel succeeds with no shipments. Phase 3b: "cancelling with a PLANNED/IN_TRANSIT/DELIVERED shipment rejected 409 listing all of them" (AC-4b); "cancelling with no shipments succeeds"; "deleting the blocking PLANNED shipment then cancelling succeeds" | — |
| BR-11 | Trade notes are optional, max 500 characters, DRAFT-only editable, normalized to null when blank | 10 | Phase 10: notes up to 500 chars round-trip exactly (AC-9); over 500 chars rejected 400 (AC-9); whitespace-only normalized to null (AC-10); PATCH outside DRAFT rejected (AC-11) | — |

**Test gaps: all closed.** BR-9's gap was closed in Phase 1; BR-1 is now
closed across Phases 2, 3a and 3b; BR-5/BR-6 are now closed across
Phases 2 and 3b; BR-11 is closed in Phase 10 (see rows above).

---

## Phase 11 — Change 002: Rename the "Corn" commodity to "Maize"

**Goal:** make "Maize" available in the Commodity dropdown on the Trade
form, per the Decision recorded in `intent/changes/002-add-maize.md` — a
**rename** of the existing "Corn" row in place, not an addition, so any
trade already referencing it by `commodityId` keeps pointing at the same
row and simply displays "Maize" afterwards. The row is never deleted.

**Decision** (`intent/changes/002-add-maize.md`'s "Decision" and "Affects
existing" sections, also recorded in spec.md §2.5): "Maize" and the
already-seeded "Corn" (`backend/prisma/seed.ts`) are the same crop under
two different regional names. No new category or unit — GRAIN/MT
already apply.

**Files:**
- `backend/prisma/migrations/20261006120000_rename_corn_to_maize/
  migration.sql` — new hand-written migration (same pattern as
  `20260924150000_add_trade_check_constraints`): `UPDATE "Commodity" SET
  name = 'Maize', "updatedAt" = now() WHERE name = 'Corn'`. `updatedAt`
  is bumped since the row's data genuinely changed (ctrm-standards #2).
  Idempotent — a database with no "Corn" row (already renamed, or never
  had one) is left untouched by a second apply. Preserves the row's
  `id`, so every existing `Trade.commodityId` FK stays valid and now
  resolves to "Maize".
- `backend/prisma/seed.ts` — change the `seedCommodities` entry
  `{ name: "Corn", category: "GRAIN", unit: "MT" }` to
  `{ name: "Maize", category: "GRAIN", unit: "MT" }`, so a brand-new
  database (no prior "Corn" row to rename) seeds "Maize" directly.
- `intent/spec.md` — §2 decision 5 and §4's Commodity example list,
  both already updated as part of this change.

**Business rules implemented:** none new; BR-9 (fixed reference data,
no create/edit/delete API) continues to apply unchanged — this is a
rename, not a schema or API change.

**Tests:**
- New (`backend/test/commodityRename.test.ts`): reads the migration's
  actual `migration.sql` file off disk at test time (`readFileSync`) and
  executes its exact contents via `prisma.$executeRawUnsafe` — never a
  hardcoded copy of the SQL — so the test and the migration can never
  drift apart. A Commodity row is created directly with `name: "Corn"`;
  a Trade is created referencing it by `commodityId`; the migration file
  is applied; then:
  - the Commodity row is refetched by its original `id` and has
    `name: "Maize"` — same `id`, proving it was renamed in place, not
    replaced — and a later `updatedAt` than before the rename.
  - the Trade is refetched (via Prisma and via `GET /api/trades/:id`)
    and its joined commodity now shows "Maize" — proving a trade that
    used "Corn" shows "Maize" afterwards, with the same underlying
    commodity.
  - running the same migration file a second time is a no-op: still
    exactly one Commodity row, still `name: "Maize"`, same `id`, and no
    row named "Corn" remains (idempotency).
  - applying the migration file against a database that already seeded
    "Maize" directly (no prior "Corn" row) leaves that row's `name`,
    `id` and `updatedAt` all untouched.
- `backend/test/seed.test.ts` and `backend/test/commodities.test.ts`
  need no changes: the former derives its expected count/contents from
  `seedCommodities` itself, the latter creates its own ad hoc rows
  (Wheat, Arabica Coffee, Sugar ICUMSA 45) rather than depending on the
  full seed list. A repo-wide search confirms nothing else hardcodes
  "Corn".

**Manual check:**
- Run `npm run db:migrate` against the dev database (which already has
  a "Corn" row from earlier seeding): confirm via `psql`/Prisma Studio
  that the same row now reads "Maize" with its `id` unchanged, and that
  any trade created earlier against "Corn" still shows the correct
  commodity, now labeled "Maize" — no manual cleanup step.
- Open the Trade form in the browser and confirm "Maize" appears in the
  commodity dropdown, with "Corn" gone, and that an existing trade's
  detail page (if one was created against "Corn" before this change)
  now shows "Maize".

---

## Phase 12 — Change 003: Configurable backend port

**Goal:** stop hard-coding the backend's port in two separate places —
`backend/src/server.ts`'s fallback and `frontend/vite.config.ts`'s
proxy target — so CTRM can run alongside kr-prolines on the same
laptop (both currently default to port 3001) without hand-editing
`vite.config.ts` every time, per
`intent/changes/003-backend-port.md`.

**Decision** (`intent/changes/003-backend-port.md`, also recorded in
spec.md §2.6): the backend's port comes from `.env`'s `PORT`, default
changed from `3001` to `3002`. The frontend's dev proxy reads the same
`.env` value, from the single root `.env` file — never a second,
frontend-local copy — so the two settings can't drift apart.

**Open design questions (recommended defaults below) — confirm with
the product owner before implementing:**
- How should `vite.config.ts` read the root `.env`'s `PORT`?
  Recommended: Vite's own `loadEnv(mode, <repo root>, '')` inside the
  function form of `defineConfig`, pointed at the same root `.env` file
  `backend/src/db.ts` already loads via `dotenv` — no new frontend
  dependency, and no second env file to keep in sync.
- What should each side fall back to if `.env`/`PORT` is missing
  entirely? Recommended: the same literal, `3002`, in both
  `backend/src/server.ts` and `frontend/vite.config.ts`, so `npm run
  dev` still works out of the box with no `.env` present.

**Files:**
- `.env.example` — `PORT=3001` → `PORT=3002`
- `backend/src/server.ts` — fallback literal `3001` → `3002`
- `frontend/vite.config.ts` — proxy target stops being the hard-coded
  string `'http://localhost:3001'`; reads `PORT` from the root `.env`
  (mechanism per the open question above), falling back to `3002`
- `CLAUDE.md` — the Commands section's "Express on port 3001" line
  updated to describe the `.env`-driven port (default `3002`) instead
  of a fixed number

**Business rules implemented:** none — dev tooling only, no change to
spec §6/§7/§8.

**Tests:** none planned — not business logic, and CI doesn't bind a
real port (the change's "Affects existing" note); verified manually.

**Manual check:** with no other project running, `npm run dev`,
confirm the backend logs "listening on port 3002" and the frontend
reaches `/api/health` through the proxy with no console errors; then
change `.env`'s `PORT` to a third value (e.g. `3099`), restart `npm run
dev`, and confirm both sides pick it up with zero edits to
`vite.config.ts`.

---

## Phase 13 — Change 004: Clear filters button on the Trades list

**Goal:** a "Clear filters" button next to the Trades list's status/
commodity/direction filters, shown only while at least one is active,
that resets all three to "All" in one click, per
`intent/changes/004-clear-filters.md` (recorded in spec.md §8 and §9,
AC-12/AC-13). Frontend-only — no backend or data model changes.

**Open design questions (recommended defaults below) — confirm with
the product owner before implementing:**
- **Button style.** Recommended: `.btn-secondary` (already defined in
  `frontend/src/index.css`, used elsewhere for non-primary actions) —
  keeps `.btn-primary` reserved for "New trade" as the one clear
  primary action on the page, per ctrm-standards rule 9.
- **Placement.** Recommended: inside the existing `.filters` row,
  immediately after the Direction filter and before "New trade" — reads
  as part of the filter controls, not a separate page-level action.
- **Visibility rule, precisely.** Recommended: purely a function of the
  current URL params on every render (`status || commodityId ||
  direction`) — not a one-time flag tied to whether the button was
  clicked. This also means manually changing every filter back to "All"
  by hand hides the button again, with no special-casing needed.
- **Confirmation before clearing.** Recommended: none — unlike Cancel/
  Complete (Phase 6), clearing filters is non-destructive and instantly
  reversible (the trades aren't changed, just which ones are shown).
- **Clearing mechanism.** Recommended: one `setSearchParams(new
  URLSearchParams())` call, reusing the same `searchParams`/
  `setSearchParams` state `updateFilter` already uses — not three
  sequential `updateFilter` calls, which would re-render and refetch
  once per filter instead of once total.

**Files:**
- `frontend/src/pages/Trades.tsx` — add the "Clear filters" button and
  its visibility/clearing logic, per the design questions above.
- `frontend/test/Trades.test.tsx` — new tests (see Tests, below).
- `intent/spec.md` — §8 and §9, already updated as part of this change.
- `intent/changes/004-clear-filters.md` — `Status` updated to `done`
  once this phase is implemented and verified.

**Business rules implemented:** none — pure UI affordance, no new
business rule, no backend change.

**Tests:**
- "Clear filters" is not rendered when the Trades list has no filter
  active (AC-13).
- "Clear filters" is rendered once any one of status/commodity/
  direction is set via the URL or a filter control (AC-12).
- Clicking "Clear filters" with multiple filters active resets the URL
  to have none of `status`/`commodityId`/`direction`, refetches
  `GET /api/trades` with no query string, and the button itself
  disappears afterward (AC-12, AC-13).

**Manual check:** on the Trades list, set all three filters, confirm
"Clear filters" appears; click it and confirm all three dropdowns
return to "All", the URL loses its query string, the full trade list
reloads, and the button disappears again.

---

## Phase 14 — Change 005: Clear filters button on the Logistics list

**Goal:** a "Clear filters" button next to the Logistics list's status/
warehouse filters, shown only while at least one is active, that resets
both to "All" in one click, per
`intent/changes/005-clear-filters-logistics.md` (recorded in spec.md §8
and §9, AC-14/AC-15). Same behavior and style as the Trades list button
(Phase 13) — frontend-only, no backend or data model changes.

**Open design questions (recommended defaults below) — confirm with
the product owner before implementing:**
- **Button style.** Recommended: `.btn-secondary`, same as Phase 13's
  Trades list button — keeps `.btn-primary` reserved for a page's one
  primary action (ctrm-standards rule 9). (Unlike Trades, Logistics has
  no primary action/button in its filter row today, so this doesn't
  compete with one.)
- **Placement.** Recommended: inside the existing `.filters` row,
  immediately after the Warehouse filter — the intent doc says "before
  any other actions," and since the Logistics filter row currently has
  no other buttons/links, this is simply the last element in the row,
  mirroring Phase 13's relative placement (right after the filter
  controls).
- **Visibility rule, precisely.** Recommended: purely a function of the
  current URL params on every render (`status || warehouseId`) — same
  mechanism as Phase 13, not a one-time flag tied to whether the button
  was clicked.
- **Confirmation before clearing.** Recommended: none — same rationale
  as Phase 13 (non-destructive, instantly reversible).
- **Clearing mechanism.** Recommended: one `setSearchParams(new
  URLSearchParams())` call, reusing `Logistics.tsx`'s existing
  `searchParams`/`setSearchParams` state — not two sequential
  `updateFilter` calls, which would re-render and refetch once per
  filter instead of once total.

**Files:**
- `frontend/src/pages/Logistics.tsx` — add the "Clear filters" button
  and its visibility/clearing logic, per the design questions above.
- `frontend/test/Logistics.test.tsx` — new tests (see Tests, below).
- `intent/spec.md` — §8 and §9, already updated as part of this change.
- `intent/changes/005-clear-filters-logistics.md` — `Status` updated to
  `done` once this phase is implemented and verified.

**Business rules implemented:** none — pure UI affordance, no new
business rule, no backend change.

**Tests:**
- "Clear filters" is not rendered when the Logistics list has no filter
  active (AC-15).
- "Clear filters" is rendered once either status or warehouse is set
  via the URL or a filter control (AC-14).
- Clicking "Clear filters" with both filters active resets the URL to
  have neither `status` nor `warehouseId`, refetches `GET /api/shipments`
  with no query string, and the button itself disappears afterward
  (AC-14, AC-15).

**Manual check:** on the Logistics list, set both filters, confirm
"Clear filters" appears; click it and confirm both dropdowns return to
"All", the URL loses its query string, the full shipment list reloads,
and the button disappears again.

---

## Phase 15 — Change 006: Counterparty filter on the Trades list

**Goal:** a "Counterparty" dropdown on the Trades list, after Direction,
so traders can see all of one counterparty's trades at a glance, per
`intent/changes/006-counterparty-filters.md` (recorded in spec.md §7,
§8 and §9, AC-16/AC-17). It works together with the existing status/
commodity/direction filters, is kept in the URL, and the existing
Phase 13 "Clear filters" button is extended to a fourth filter.

**Files:**
- `backend/src/modules/trades/schema.ts` — `listTradesQuerySchema` gains
  `counterpartyId: z.string().uuid({ message: "must be a valid UUID" }).optional()`,
  the same shape as the existing `commodityId` filter field (a malformed
  id is rejected 400; a well-formed but nonexistent id is simply not
  matched by any trade, same as `commodityId` today — no existence
  check, since this is a list filter, not a foreign key being written).
- `backend/src/modules/trades/service.ts` — `ListTradesFilters` gains
  `counterpartyId?: string`; `listTrades`'s `where` clause gains
  `counterpartyId: filters.counterpartyId`, combined with the existing
  filters exactly as `commodityId` is today (Prisma ANDs all three/four
  together when present).
- `backend/test/trades.test.ts` — new filter test (see Tests, below).
- `frontend/src/pages/Trades.tsx` — add a "Counterparty" `<select>`
  after the Direction filter, backed by the `counterparties` reference
  data already fetched on this page (currently used only to render
  names in the table); reuse `updateFilter("counterpartyId", ...)`,
  the existing `status`/`commodityId`/`direction` pattern; extend the
  "Clear filters" visibility check and the query-string builder to
  include `counterpartyId`.
- `frontend/test/Trades.test.tsx` — existing "Clear filters" tests
  extended to a fourth filter (see Tests, below); new counterparty
  filter tests.
- `intent/spec.md` — §7, §8 and §9, already updated as part of this
  change.
- `intent/changes/006-counterparty-filters.md` — `Status` updated to
  `done` once this phase is implemented and verified.

**Business rules implemented:** none — a new list filter and dropdown,
no new business rule, no database or data model change (per the change
request's "Affects existing"/"Out of scope" sections).

**Tests:**
- Backend: `GET /api/trades?counterpartyId=<id>` returns only that
  counterparty's trades (AC-16).
- Backend: combining `counterpartyId` with another filter (e.g.
  `status`) returns only trades matching both (AC-16).
- Backend: a malformed (non-UUID) `counterpartyId` query param is
  rejected 400, same as a malformed `commodityId` today.
- Backend: a well-formed but nonexistent `counterpartyId` returns an
  empty list, not an error, same as `commodityId` today.
- Frontend: a `counterpartyId` filter present in the URL on initial
  render is applied (fetched with that query param), same as the
  existing status/commodity/direction tests.
- Frontend: changing the Counterparty dropdown updates the URL query
  params and refetches with that filter.
- Frontend: "Clear filters" is shown when only the counterparty filter
  is active, and hidden again when none of the four filters is active
  (extends the existing "no filter active" / "one filter active" tests
  to the fourth filter).
- Frontend: clicking "Clear filters" with all four filters set (not
  just the existing three) resets all of them, refetches the unfiltered
  list, and the button disappears afterward (extends the existing
  "clicking Clear filters with all three filters set" test to four).

**Manual check:** on the Trades list, pick a counterparty from the new
dropdown and confirm only that counterparty's trades are shown; combine
it with the Status filter and confirm both apply together; refresh the
page and confirm the counterparty filter survives; click "Clear
filters" and confirm all four dropdowns (including Counterparty) return
to "All" and the button disappears.

---

## Phase 16 — Change 007: Guardrail hooks

**Goal:** stop three mistakes a Claude Code session has actually made in
this repo — editing an already-applied migration, stopping/removing the
Postgres container (and backgrounding a dev server), and editing a test
file to make a bug disappear instead of fixing it — by blocking them
with `PreToolUse` hooks instead of relying on a written rule, per
`intent/changes/007-guardrail-hooks.md`. Hooks only; no app code, data
or test changes.

**Decision, hook mechanics (shared by all three, detail per hook
below):**
- Hooks are registered in `.claude/settings.json` (committed, shared
  with every session on this repo) and call Node.js scripts under
  `.claude/hooks/`, not shell scripts, since the developer is on
  Windows and the scripts must run the same way whether invoked from
  PowerShell, cmd, or bash — per CLAUDE.md's environment note.
- Each hook reads the tool-call JSON Claude Code pipes to its stdin,
  inspects `tool_name`/`tool_input`, and writes a decision to stdout as
  `{"hookSpecificOutput": {"hookEventName": "PreToolUse",
  "permissionDecision": "allow" | "deny" | "ask",
  "permissionDecisionReason": "<message>"}}`, then exits `0`. `"deny"`
  blocks the call and returns the reason to Claude as an error; `"ask"`
  pauses for the user's own approval (the normal permission prompt),
  showing the reason there; omitting output (or `"allow"`) lets the
  call proceed normally. All three hooks share one helper,
  `.claude/hooks/lib/hookUtil.js`, for reading stdin and emitting this
  JSON, plus the small git helpers Hooks 1 and 3 both need (below).
- **Known limitation, both Hook 1 and Hook 3:** `PreToolUse` only fires
  for tool calls — their matchers are `Edit|Write`, so a migration or
  test file changed via a shell command (`Bash`/`PowerShell`, e.g. a
  `node -e "fs.writeFileSync(...)"` or `Set-Content`) is not inspected
  by either hook and is not caught. Worth revisiting (e.g. extending
  Hook 2's matcher to also scan `Bash`/`PowerShell` commands for writes
  to these paths) if that gap is ever actually hit; out of scope for
  this phase.

### Hook 1 — block editing a migration once it's committed
- **Event/matcher:** `PreToolUse`, matcher `Edit|Write` (`Write` can
  create a brand new file as well as overwrite an existing one, so it
  needs the same check as `Edit`).
- **Checks:** the target path matches
  `backend/prisma/migrations/**/migration.sql`, AND the file is tracked
  in `HEAD` — checked with `git cat-file -e HEAD:<relative path>`
  (exit `0` means it's part of the current commit). An uncommitted new
  migration (untracked, or staged but never committed) is not in
  `HEAD` yet and is always allowed, no matter how many times it's
  rewritten before that first commit; once committed, every further
  edit is blocked, regardless of the working tree's own state.
- **Message Claude sees:**
  > Blocked: `<path>` is a committed migration. Editing a migration
  > that's already in git history desyncs the database's migration
  > history from the migrations folder — anyone (including CI) who
  > re-applies migrations from scratch gets a different result than
  > this database already has. To fix a mistake in it, create a new
  > migration that corrects it instead (edit `schema.prisma` and run
  > `npm run db:migrate`, or hand-write a new timestamped migration
  > folder) — the same pattern already used for the trade check
  > constraints and the Corn→Maize rename.

### Hook 2 — database/dev-server guardrails
- **Event/matcher:** `PreToolUse`, matcher `Bash|PowerShell`.
- **Checks:**
  1. **Deny.** `tool_input.command` matches a container stop/remove
     pattern: `docker (compose )?(down|stop|kill|rm)`, `docker-compose
     (down|stop|kill|rm)`, `docker volume rm`, `docker system prune`,
     or the npm script `db:down` — this also catches `npm run db:down`
     even though CLAUDE.md documents it as the normal way to stop the
     database, because the point of the hook is to force a pause
     before a Claude session (not a human at the keyboard) does it.
  2. **Deny.** A dev-server start: `tool_input.run_in_background ===
     true` AND the command matches `npm run dev`, `npm start`, `vite`,
     `nodemon`, `ts-node-dev`, or `concurrently` — OR the command text
     itself backgrounds a process (trailing ` &`, `nohup`, `disown`,
     Windows `start /b`, PowerShell `Start-Process`) even without the
     tool's own `run_in_background` flag set.
  3. **Ask.** `tool_input.command` matches `prisma migrate reset` (any
     invocation — directly, via `npx`, or via `db:migrate`'s own
     `run-with-env.mjs` wrapper) or references the npm script
     `db:test:reset`. Unlike checks 1-2, this doesn't block outright:
     it drops into the normal permission prompt so the user approves
     or denies it themselves, since `db:test:reset` is a legitimate,
     CLAUDE.md-documented way to repair a broken test database, but a
     bare `prisma migrate reset` run outside that script's
     test-database wrapper would reset whatever database
     `DATABASE_URL` currently points at — `ctrm_dev` by default.
- **Message Claude sees (container case, deny):**
  > Blocked: `<command>` stops or removes the project's Postgres
  > container. It should keep running for the rest of the session —
  > if it genuinely needs to be stopped or removed, ask the user to
  > run `npm run db:down` (or `docker compose down`) themselves.
- **Message Claude sees (background dev-server case, deny):**
  > Blocked: starting a dev server in the background leaves a process
  > the user can't see that outlives this command. Run `npm run dev`
  > in the foreground so its output stays visible and it stops when
  > the tool call does, or ask the user to start it themselves in
  > their own terminal.
- **Message shown at the approval prompt (reset case, ask):**
  > `<command>` drops and recreates a database from scratch. If this
  > is `db:test:reset` against `ctrm_test`, that's expected and safe;
  > if it's a bare `prisma migrate reset` it may target `ctrm_dev`
  > instead. Confirm this is the database and the intent before it
  > runs.

### Hook 3 — block editing a test file once the failing test is committed
The playbook for a bug fix is: write the failing test first and commit
it, *then* fix the application code — test edits are only meant to be
blocked for the second part. A blanket "no test edits on a `fix/`
branch" rule would also block step one, so this hook uses the same
committed-vs-not distinction as Hook 1, scoped per file instead of
forever: a test file is editable right up until a commit captures it
with no further changes pending, then it's frozen.
- **Event/matcher:** `PreToolUse`, matcher `Edit|Write`.
- **Checks:** the target path matches a test file (`backend/test/**`,
  `frontend/test/**`, or `*.test.ts(x)`), AND the current branch starts
  with `fix/` (same convention as before — off this branch, Hook 3
  never fires), AND the file is both tracked in `HEAD` and clean
  (`git diff --quiet HEAD -- <path>` exits `0`, i.e. the working copy
  exactly matches the last commit). A file that's untracked (the
  failing test, still being written, never committed) or tracked but
  currently dirty (edited again since its last commit, not yet
  re-committed) is allowed either way — both are "still writing the
  test" states. Only a file that's tracked *and* clean — last touched
  by a commit, nothing pending since — is blocked, since the only way
  to reach that state is "already committed, nothing changed since."
- **Message Claude sees:**
  > Blocked: `<path>` is a committed test file on a `fix/` branch, with
  > no uncommitted changes to it — it looks like the failing test is
  > already captured in a commit. Fix the application code the test
  > caught, not the test itself. If the test genuinely needs changing,
  > say so and get the user's agreement first.

**Files:**
- `.claude/settings.json` — new; registers all three `PreToolUse` hooks.
- `.claude/hooks/block-migration-edit.js` — Hook 1.
- `.claude/hooks/block-db-guardrails.js` — Hook 2 (container stop/
  remove + background dev-server denies, reset-command ask).
- `.claude/hooks/block-bugfix-test-edit.js` — Hook 3.
- `.claude/hooks/lib/hookUtil.js` — shared helper: read/parse stdin
  JSON, emit the `allow`/`deny`/`ask` output, and the two git checks
  Hooks 1 and 3 both need (`isTrackedAtHead(path)`,
  `isCleanAtHead(path)`).
- `CLAUDE.md` — a short note under Conventions naming the `fix/...`
  branch convention Hook 3 relies on (including "commit the failing
  test before starting the fix"), and that guardrail hooks exist and
  why (so a future session isn't surprised by a block).
- `intent/changes/007-guardrail-hooks.md` — `Status` to `done`, open
  question resolved, once implemented and verified.

**intent/spec.md:** no change. spec.md documents the application's own
requirements and business rules (trades, logistics, inventory,
dashboard) — these hooks constrain how a Claude Code session behaves in
this repo, not the application, the same reasoning Phase 12 (backend
port) used for not touching spec.md.

**Business rules implemented:** none — tooling/process only.

**Tests:** none planned — hooks aren't app code and aren't exercised by
Vitest; verified manually, same as Phase 12/13's "Tests: none planned."

**Manual check:**
- Create a new migration file (not yet committed) and confirm it's
  editable; commit it, try to `Edit` it again, and confirm Hook 1
  blocks it.
- Ask Claude to run `docker compose down` (or `npm run db:down`) and
  confirm it's denied; ask it to start `npm run dev` in the background
  and confirm that's denied too; confirm a normal foreground `npm run
  dev` still works; run `npm run db:test:reset` (or a bare `prisma
  migrate reset`) and confirm it pauses for approval instead of running
  or being denied outright.
- On a branch named `fix/...`: write a new failing test (uncommitted)
  and confirm it's editable; commit it; try to edit that same test file
  again and confirm Hook 3 blocks it; confirm editing application code
  is unaffected. On `main` (or a `change-NNN-*` branch), confirm the
  same committed test file stays editable (Hook 3 doesn't apply off a
  `fix/` branch).

---

## Phase 17 — Change 008: Production build serves the built frontend

**Goal:** the backend can serve the app as a single Node process — the
built frontend (`frontend/dist`) plus the existing `/api/*` routes — so
there's no Vite dev proxy, no CORS middleware, and nothing else needed
to put one process behind a URL on a host like Render. Local dev
(`npm run dev`, Vite + proxy) is completely unaffected.

**Decision** (`intent/changes/008-deploy-demo.md`, recorded in
spec.md §11): the backend serves static files only in production
(`NODE_ENV === "production"`), never in dev — `backend/src/app.ts`
gains, after every `/api/*` router and before the global error
handler: `express.static(...)` pointed at `frontend/dist`, then a GET
catch-all for any non-`/api` path that returns `frontend/dist/
index.html` (so a hard refresh on a client-side route like
`/trades/:id` resolves to the SPA, not a 404). Resolved relative to the
compiled `backend/dist/server.js`'s own location, which works
regardless of the host's working directory as long as the whole repo
(not just `backend/`) is present at deploy time — true here, since
`npm run build` at the repo root builds both workspaces in place.

**Files:**
- `backend/src/app.ts` — static-serving + SPA fallback, guarded by
  `NODE_ENV`.
- `intent/spec.md` — §11 "Deployment" (new section) and decisions 7-9.
- `intent/changes/008-deploy-demo.md` — open questions resolved.

**Business rules implemented:** none — deployment infrastructure only.

**Tests:**
- With `NODE_ENV=production` and a built `frontend/dist` present,
  requesting `GET /` returns the built `index.html`; requesting a
  client-side route like `GET /trades/abc` also returns `index.html`
  (SPA fallback); requesting a real static asset (e.g.
  `GET /assets/app.js`) returns that file's own content, not
  `index.html`; requesting `GET /api/unknown` is not hijacked by the
  SPA fallback — it returns the same (non-JSON, Express-default) 404
  this route already returned before this phase — proves the
  catch-all is scoped to non-`/api` paths. A proper JSON 404 for
  unmatched `/api/*` routes is a known gap, tracked separately, not
  addressed in this phase.
- With `NODE_ENV=production`, a real API route (`GET /api/health`)
  still returns its normal JSON response, not static-file handling.
- With `NODE_ENV` unset/`development`, the static middleware and
  fallback are not registered at all (existing dev behavior/tests
  unaffected).

**Manual check:** `npm run build`, then `NODE_ENV=production PORT=3002
node backend/dist/server.js` from the repo root; open
`http://localhost:3002` in a browser, confirm the app loads and
client-side navigation plus a hard refresh on a detail page both work,
with no Vite process running at all.

---

## Phase 18 — Change 008: Deploy-time migrations and idempotent seed

**Goal:** every boot of the deployed app safely applies any pending
database migrations and (re-)seeds fixed reference data, with no
manual step and no risk of a reset — since Render's free tier has no
"Pre-Deploy Command"/one-off-job mechanism to run these separately
from the app's own start command.

**Decision** (spec.md §11): the production start command becomes a
short wrapper — `prisma migrate deploy` (never `migrate reset`), then
`prisma/seed.ts`, then `node dist/server.js` — instead of just `node
dist/server.js`. Both `migrate deploy` and the existing upsert-based
seed script are idempotent, so running them on every boot (including
every cold-start wake from sleep) is safe and needs no new "has this
run before" state.

**Files:**
- `backend/package.json` — new `start` script (or a
  `backend/scripts/start-prod.mjs` wrapper, consistent with the
  existing `scripts/run-with-env.mjs` pattern) chaining migrate → seed
  → server.
- `backend/prisma/seed.ts` — confirm it still runs correctly from the
  production environment (e.g. via `tsx` if that stays a runtime
  dependency, or compiled alongside the rest of `src` by `tsc`) —
  whichever needs the smaller change.
- `intent/plan.md` — this phase.

**Business rules implemented:** none — deployment infrastructure only.
BR-9 (fixed reference data, no create/edit/delete API) is unaffected:
the seed script still only upserts Commodity/Counterparty/Warehouse
rows, never Trade/Shipment data.

**Tests:**
- New (`backend/test/startProd.test.ts`): running `scripts/
  start-prod.mjs` as a child process with an invalid `DATABASE_URL`
  exits non-zero and the server never starts (`prisma migrate deploy`
  fails first and aborts the chain before `tsx prisma/seed.ts` or
  `node dist/server.js` ever runs, so a broken deploy fails loudly
  instead of serving a half-applied database). No idempotency test is
  added here: the seed script's upsert-based idempotency is already
  proven by Phase 1's `backend/test/seed.test.ts` ("creates no
  duplicates when run twice"), and `prisma migrate deploy`'s
  idempotency is Prisma's own guarantee, not this project's code.

**Manual check:** against `ctrm_dev` (already migrated/seeded via the
normal dev workflow), from the repo root:
```
npm run build
set NODE_ENV=production
npm run start -w backend
```
Confirm it prints `CTRM backend listening on port 3002` with no
errors, then stop it (Ctrl+C) and run `npm run start -w backend`
again (`NODE_ENV` stays set in the same cmd window) — confirm the
second run also applies cleanly (no pending migrations, no errors)
and reseeds with no duplicate rows, and the server starts normally
again. Open `http://localhost:3002` in a browser to confirm the app
still loads.

---

## Phase 19 — Change 008: Render blueprint (staging + production)

**Goal:** define both hosted environments as code — one committed
`render.yaml` Render reads directly, instead of manually clicking
through Render's dashboard to create each service.

**Decisions confirmed for this phase, recorded in spec.md §11:**
- One free Render Postgres instance, holding two logical databases
  (`ctrm_staging`, `ctrm_production`) — Render's free tier allows only
  one Postgres database per workspace. Creating the second logical
  database is a one-time manual step against the instance's connection
  string (not expressible in `render.yaml`, which only wires one
  connection string per database resource); documented here rather
  than automated.
- `ctrm-staging`: tracks `main`, `autoDeployTrigger: checksPass` (waits
  for GitHub's CI check to go green before deploying — no GitHub
  Actions step needed to trigger it).
- `ctrm-production`: tracks `main`, `autoDeployTrigger: off` — it is
  never deployed by a push; only by its deploy hook (Phase 21).
- Both services set `healthCheckPath: /api/health` and
  `NODE_ENV: production`; `DATABASE_URL` is wired via `fromDatabase`
  for staging, and set manually (`sync: false`) for production, since
  its logical database isn't the blueprint-managed one.
- `buildCommand: npm ci && npm run build` (repo root); `startCommand`
  is Phase 18's new wrapper script.

**Files:**
- `render.yaml` — new, at repo root.
- `intent/spec.md` — §11, decision 7.
- `intent/changes/008-deploy-demo.md` — "does the free tier allow two
  databases?" open question resolved.

**Business rules implemented:** none — deployment infrastructure only.

**Tests:** none planned — infrastructure config, not app code; verified
manually (below) and implicitly by every later phase's deploys
succeeding.

**Manual check:** connect the repo as a Render Blueprint; confirm both
services and the one database are created as described; manually
create the second logical database and point `ctrm-production`'s
`DATABASE_URL` at it; trigger `ctrm-staging`'s first deploy (e.g. by
pushing a trivial commit to `main` once CI is green) and confirm it
goes live and `GET /api/health` returns 200 through Render's own URL.

---

## Phase 20 — Change 008: Guardrail hook blocking Claude from deploying to production

**Goal:** stop a Claude Code session from being able to trigger or
approve a production deploy by itself — a human must always be the one
who triggers the deploy hook and approves the GitHub Environment gate —
using the same `PreToolUse`-hook mechanism
`intent/changes/007-guardrail-hooks.md` already established for the
three existing guardrails (Phase 16). Comes before Phase 21 (the
approval-gated production deploy workflow) so the gate exists before
anything can deploy to production.

**Decision, hook mechanics** (reuses Phase 16's shared helper and
style):
- **Event/matcher:** `PreToolUse`, matcher `Bash|PowerShell`.
- **Checks (deny):**
  1. The command is an HTTP call (`curl`, `Invoke-WebRequest`,
     `Invoke-RestMethod`, `wget`, ...) whose target matches Render's
     deploy-hook URL shape (`api.render.com/deploy/srv-...`) — in this
     design, only the production service has a deploy hook at all
     (staging deploys natively via Render's own `checksPass` trigger,
     Phase 19), so this rule has no legitimate match to accidentally
     block.
  2. The command calls the GitHub API's pending-deployment-review
     endpoint (`gh api .../pending_deployments`, or an equivalent raw
     `curl`/`Invoke-RestMethod` to `api.github.com`) with an approval
     state — this is how the `production` Environment's required-
     reviewer gate (Phase 21) could otherwise be self-approved from the
     command line.
- **Message Claude sees:** explains that production deploys and their
  approval are reserved for a human, and that the normal way to ship a
  change is still to merge to `main` and let the existing pipeline (and
  reviewer) handle it.

**Files:**
- `.claude/settings.json` — register the new hook.
- `.claude/hooks/block-production-deploy.js` — new, reusing
  `.claude/hooks/lib/hookUtil.js` from Phase 16.
- `CLAUDE.md` — note alongside the existing three guardrail hooks.
- `intent/spec.md` — §11.

**intent/spec.md:** §11 only — same reasoning as Phase 16: this
constrains how a Claude Code session behaves in this repo, not the
application itself.

**Business rules implemented:** none — tooling/process only.

**Tests:** none planned — hooks aren't app code; verified manually,
same as Phase 16.

**Manual check:** ask Claude to run a `curl`/`Invoke-RestMethod`
against the production deploy hook URL and confirm it's denied; ask it
to call the GitHub pending-deployments API with an approval state and
confirm that's denied too; confirm a normal `git push origin main` (the
actual way to ship) is unaffected.

---

## Phase 21 — Change 008: Approval-gated production deploy

**Goal:** production deploys only after a human approves them in
GitHub, by routing every production deploy through a GitHub Actions job
gated on a `production` Environment with a required reviewer. Comes
after Phase 20, so the guardrail hook blocking Claude from triggering
or approving this gate is already in place before this phase makes a
real production deploy possible.

**Decisions confirmed for this phase, recorded in spec.md §11:**
- A `production` GitHub Environment, with at least one required
  reviewer, created once via the repo's Settings → Environments UI —
  GitHub doesn't support defining environment protection rules in a
  committed workflow file, so this one setup step stays manual and is
  documented rather than automated.
- New workflow, triggered on push to `main` after the existing CI
  workflow succeeds (`workflow_run`), with a single job:
  `environment: production` (so the job itself pauses for approval),
  then a step that POSTs to the production deploy hook
  (`${{ secrets.RENDER_PRODUCTION_DEPLOY_HOOK }}`, stored as a secret
  scoped to the `production` Environment, never a repo-wide secret).
- An optional follow-up step polls `GET /api/health` on the production
  URL (with a timeout/backoff) purely so the workflow run itself shows
  pass/fail — the actual gating smoke test is still Render's
  `healthCheckPath` from Phase 19, which runs regardless of whether
  this step exists.

**Files:**
- `.github/workflows/deploy-production.yml` — new.
- `intent/spec.md` — §11.
- `intent/changes/008-deploy-demo.md` — pipeline details recorded.
- (Manual, not a file) repo Settings → Environments → `production`,
  with a required reviewer.

**Business rules implemented:** none — deployment infrastructure only.

**Tests:** none planned — not exercised by Vitest; verified manually,
same as Phase 16.

**Manual check:** merge a trivial change to `main`; confirm
`ctrm-staging` deploys automatically with no approval step; confirm the
new workflow's production job pauses waiting for review; approve it as
the configured reviewer and confirm the production deploy hook fires
and `ctrm-production` goes live; reject/don't approve a second time and
confirm production is untouched.

---

## Phase 22 — Change 008: Rollback script, practiced on staging

**Goal:** a single command to roll back a bad deploy, exercised against
staging before it's ever needed against production.

**Decision** (spec.md §11, decision 9): rollback re-enters the normal
pipeline rather than a separate platform-specific mechanism — `npm run
rollback -- <commit-sha>` runs `git revert <sha> --no-edit && git push
origin main`. For staging this immediately triggers Phase 19's
`checksPass` auto-deploy once CI passes on the revert commit; for
production it still requires the Phase 21 approval step, same as any
other change — rollback isn't a way around that gate.

**Files:**
- `package.json` (root) — new `rollback` script.
- `intent/spec.md` — §11, decision 9.
- `intent/changes/008-deploy-demo.md` — rollback approach recorded;
  `Status` → `done` once this phase (the last of the change) is
  implemented and verified — this closes out the change.

**Business rules implemented:** none — deployment infrastructure only.

**Tests:** none planned — a thin wrapper around `git revert`/`git
push`, verified manually.

**Manual check:** push a trivial, clearly-identifiable change to
`main`, let it deploy to staging, then run `npm run rollback -- <that
commit's sha>` and confirm a revert commit is created and pushed, CI
runs on it, and staging redeploys back to the prior behavior.

---

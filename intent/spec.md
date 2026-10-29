# Spec: Basic agricultural CTRM (learning project)

Author: Yermal Udaya Shreesha. Status: draft. Based on `intent/intent.md`.

## 1. Stack

Proposed: React + TypeScript (Vite) frontend, Node.js + Express +
TypeScript backend, Prisma ORM with PostgreSQL, single repo (frontend/
and backend/ as workspaces).

Assessment: this fits. The domain is CRUD-plus-business-rules over a
handful of related entities with one dashboard view — no need for a
heavier framework (no SSR/SEO requirement, single user, runs locally).
Prisma + PostgreSQL gives real transactions and `DECIMAL` types, which
matters directly for standard 1 (no floats for money/quantity) and the
inventory-never-negative rule, which is safest enforced with a DB-level
`CHECK` constraint plus a serializable transaction, not just app code.
SQLite would also work for a single-user local app and would remove the
"install PostgreSQL locally" step; it's flagged as a lighter-weight
alternative below in Open questions / concerns, but PostgreSQL is kept
as proposed since it's closer to what a real CTRM would run and the
skill's Prisma/decimal guidance applies equally to both.

No auth, no multi-tenancy, no message queue, no external services —
none are implied by the intent and none are added.

## 2. Decisions (open questions resolved by product owner)

1. **Currency.** Fixed enum: `USD`, `EUR`, `GBP`. One currency per
   trade (`currency` field on Trade). Display only — the dashboard
   never sums or converts across currencies, only quantities (MT),
   matching "out of scope: multi-currency conversion."

2. **Shipments per trade.** One trade can have multiple shipments
   (one-to-many, Trade → Shipments). Two related rules apply, checked
   at different times (see BR-4 and BR-4a in section 6):
   - The sum of a trade's shipment quantities may never **exceed** the
     trade quantity — checked on every shipment create or edit.
   - The sum of a trade's shipment quantities must **equal** the trade
     quantity, and every shipment must be DELIVERED, before the trade
     can be marked COMPLETED.

3. **Counterparties and warehouses.** Seed data only in this version:
   no CRUD screens, no create/edit/deactivate API, no `isActive`
   field. They are exposed only via read-only `GET` endpoints, used to
   populate dropdowns on the Trade and Shipment forms. Editable lists
   are deferred — see section 10, "Out of scope / future intent."

4. **PostgreSQL vs SQLite.** PostgreSQL, as proposed in section 1.
   Both satisfy the skill's Prisma/decimal requirements equally for
   this single-user local app; PostgreSQL is kept since it's closer to
   what a real CTRM would run.

5. **"Maize" vs. the seeded "Corn" commodity — decision recorded in
   `intent/changes/002-add-maize.md`'s "Decision" section: a rename, not
   an addition.** Maize and corn are the same crop (Zea mays) —
   "maize" is the international/UK term, "corn" the US term used in
   the original seed data. Rather than add a second GRAIN commodity
   for the same crop (which would split net-position and inventory
   figures across two rows for what a trader considers one
   commodity), the existing "Corn" row is renamed to "Maize" **in
   place** — same `id`, never deleted and recreated — so any Trade
   already referencing that commodity by `commodityId` keeps pointing
   at it and simply displays "Maize" from then on, per
   `intent/changes/002-add-maize.md`'s "Affects existing" section. No
   new category or unit is introduced — GRAIN/MT already cover it.
   This is done two ways together, both idempotent (safe to run more
   than once, and safe against a database that never had a "Corn" row
   at all):
   - A hand-written Prisma migration (same pattern as
     `20260924150000_add_trade_check_constraints`) runs
     `UPDATE "Commodity" SET name = 'Maize', "updatedAt" = now() WHERE
     name = 'Corn'` against whatever database it's applied to (dev, or
     any future deployed environment) — a one-time, in-place rename via
     `prisma migrate deploy`/`db:migrate`/`db:test:migrate`, not a
     manual cleanup step. `updatedAt` is bumped since the row's data
     genuinely changed (ctrm-standards #2).
   - `backend/prisma/seed.ts`'s `seedCommodities` entry is updated from
     `"Corn"` to `"Maize"`, so a fresh database that seeds for the
     first time (no migration history to "rename" from) gets "Maize"
     directly.

6. **Backend port is configurable, not fixed at 3001** — decision
   recorded in `intent/changes/003-backend-port.md`: another project on
   the same laptop (kr-prolines) also defaults its backend to port
   3001, so running both at once sends CTRM's frontend to the wrong
   backend unless `vite.config.ts` is hand-edited every time. The
   backend's HTTP port is read from `.env`'s `PORT` variable, default
   changed to `3002`; the frontend's Vite dev server proxy reads the
   same `.env` value for its `/api` target, from the one root `.env`
   file — never a second, frontend-local copy — so the two settings
   can never drift apart and nobody edits `vite.config.ts` by hand to
   work around a clash. Production/deployment port configuration is out
   of scope here (see change 008, deployment, section 11).

7. **Database hosting for staging/production demo deploys**: one free
   Render Postgres instance, holding two logical databases
   (`ctrm_staging`, `ctrm_production`), rather than two separate free
   databases (Render's free tier allows only one Postgres database per
   workspace) or a paid second instance. Decision recorded in
   `intent/changes/008-deploy-demo.md`, detail in section 11. Both
   environments share the same 30-day expiry clock and are recreated
   together — accepted since both hold only demo data.

8. **Demo data is never reset automatically.** Only the fixed reference
   data (Commodity/Counterparty/Warehouse) auto-reseeds, idempotently,
   on every deploy/boot. Trade/Shipment/Inventory data is left alone
   indefinitely; an automatic or even a built-in manual reset mechanism
   is out of scope for this version. Decision recorded in
   `intent/changes/008-deploy-demo.md`.

9. **Rollback is a single script, not a platform-specific dashboard
   action.** `npm run rollback -- <sha>` reverts and re-pushes to
   `main`, reusing the normal CI/deploy pipeline rather than Render's
   dashboard rollback button, so the same path is exercised — and can
   be practiced on staging — whether rolling forward or back. Decision
   recorded in `intent/changes/008-deploy-demo.md`.

## 3. Areas of concern

- **Inventory never-negative is a concurrency-sensitive rule.** With a
  single user this is low-risk in practice, but the design still
  routes every stock mutation through one service function inside a
  DB transaction with a `CHECK (quantity >= 0)` constraint as the
  backstop, per standard 4 (enforced in backend, not just UI).
- **Shipment delivery is the trigger for inventory changes**, which
  means Shipment status transitions and Inventory mutations are
  coupled: marking a shipment "Delivered" must atomically update stock.
  This coupling is called out explicitly in section 6 (business rules)
  so it isn't missed during implementation.
- **Trade quantity vs. sum of shipment quantities** is now checked at
  two points, per the product owner decision in section 2.2: the sum
  may never exceed the trade quantity (checked on every shipment
  create/edit — BR-4a), and must exactly equal the trade quantity at
  completion time (BR-4). Both checks are needed — the create/edit cap
  catches over-shipment early; the completion equality check catches
  under-shipment (a trade left with unshipped quantity can't complete).
- **Warehouse selection on a Sell trade's shipment**: a sale shipment
  must decrement stock from a specific warehouse, so the warehouse must
  have enough stock of that commodity at departure time — this is
  effectively a second "never negative" check, separate from the
  purchase-side inventory increase. Both directions are covered in
  section 6.
- **`warehouseId` vs. the shipment's free-text `origin`/`destination`.**
  Shipment has a structured `warehouseId` (the warehouse whose stock
  is actually moved — see BR-2/BR-3) plus separate free-text `origin`
  and `destination` fields (for logistics tracking, e.g. a port or
  border crossing name that isn't itself a Warehouse record). These
  can drift out of sync if a user picks a warehouse that doesn't match
  what they typed in origin/destination — the UI should default
  destination (for a BUY shipment) or origin (for a SELL shipment) to
  the selected warehouse's name/location to reduce this risk, but
  nothing prevents overriding it. Flagged since intent.md doesn't
  address this and it's easy to build inconsistently.
- **No login, single user**: `createdAt`/`updatedAt` are kept (standard
  2) but there is no `createdBy` concept anywhere — intentional, not an
  oversight, per "no login."
- **Reference data is now fixed seed data** (decision 3): with no
  create/edit/delete API for Counterparty or Warehouse, there's no
  orphaned-foreign-key risk to guard against in this version. This
  concern returns if/when editable lists are built later (section 10).

## 4. Data model

All monetary and quantity fields use `DECIMAL`, never float (standard
1). All tables include `id` (UUID, primary key), `createdAt`,
`updatedAt` (standard 2).

### Commodity (fixed reference/seed data — Grains, Coffee, Sugar and
their variants; simple enough not to need a CRUD screen)
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | string | unique, e.g. "Wheat", "Maize", "Arabica Coffee", "Sugar ICUMSA 45" |
| category | enum | GRAIN, COFFEE, SUGAR |
| unit | enum | fixed to MT for this app |

### Counterparty (fixed seed data in this version — no CRUD, see
section 10)
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | string | required, unique |
| type | enum | BUYER, SELLER, BOTH |

### Warehouse (fixed seed data in this version — no CRUD, see
section 10)
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | string | required, unique |
| location | string | free text |

### Trade
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| commodityId | UUID | FK → Commodity |
| direction | enum | BUY, SELL |
| counterpartyId | UUID | FK → Counterparty |
| quantityMt | DECIMAL(12,3) | > 0 |
| price | DECIMAL(12,2) | > 0, fixed price per MT |
| currency | enum | USD, EUR, GBP — display only, no conversion |
| deliveryPeriodStart | date | |
| deliveryPeriodEnd | date | ≥ deliveryPeriodStart |
| status | enum | DRAFT, CONFIRMED, COMPLETED, CANCELLED |
| notes | string, nullable | optional free text, max 500 characters; editable only while status is DRAFT, like every other Trade field; whitespace-only input is trimmed and stored as `null` (BR-11) |
| createdAt / updatedAt | timestamp | |

### Shipment
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tradeId | UUID | FK → Trade |
| warehouseId | UUID | FK → Warehouse — the **destination** warehouse (stock increases here) for a BUY-trade shipment, the **origin** warehouse (stock decreases here) for a SELL-trade shipment. This is the warehouse that actually drives inventory (BR-2/BR-3) — see the origin/destination note in section 3. |
| quantityMt | DECIMAL(12,3) | > 0; sum across a trade's shipments must never exceed trade quantity, checked on every create/edit (BR-4a), and must equal trade quantity before the trade can complete (BR-4) |
| transportMode | enum | TRUCK, RAIL, VESSEL |
| origin | string | free text |
| destination | string | free text |
| plannedDepartureDate | date | |
| plannedArrivalDate | date | ≥ plannedDepartureDate |
| actualDepartureDate | date, nullable | set when status → IN_TRANSIT; client may supply it in the depart request body (defaults to today, server's local calendar date, not UTC; rejected if in the future) |
| actualArrivalDate | date, nullable | set when status → DELIVERED; client may supply it in the deliver request body (defaults to today; rejected if in the future or before actualDepartureDate) |
| status | enum | PLANNED, IN_TRANSIT, DELIVERED |
| createdAt / updatedAt | timestamp | |

### InventoryMovement (append-only ledger — the source of truth for
stock; current stock is derived, never stored as a separately-edited
number, so it can't drift out of sync with movements)
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| warehouseId | UUID | FK → Warehouse |
| commodityId | UUID | FK → Commodity |
| shipmentId | UUID | FK → Shipment (the shipment delivery/departure that caused this movement), **unique** — a shipment triggers at most one stock change (a BUY shipment's delivery, or a SELL shipment's departure, never both), so a second movement for the same shipmentId would mean the same event was recorded twice; rejected rather than allowed |
| quantityMt | DECIMAL(12,3) | signed: positive for a BUY-shipment delivery, negative for a SELL-shipment departure |
| createdAt | timestamp | |

### InventoryBalance (derived/materialized view, one row per
warehouse+commodity, recomputed from InventoryMovement inside the same
transaction that writes a movement — kept as a real table, not a
runtime SUM query, so the DB `CHECK (quantityMt >= 0)` constraint can
enforce standard 4 directly)
| Field | Type | Notes |
|---|---|---|
| warehouseId | UUID | FK → Warehouse, part of composite PK |
| commodityId | UUID | FK → Commodity, part of composite PK |
| quantityMt | DECIMAL(12,3) | `CHECK (quantityMt >= 0)` |
| updatedAt | timestamp | |

### Relationships
- Commodity 1—N Trade
- Counterparty 1—N Trade
- Trade 1—N Shipment
- Warehouse 1—N Shipment
- Shipment 1—N InventoryMovement (0 or 1 in practice — one movement
  created when a shipment reaches the state that triggers a stock
  change)
- Warehouse × Commodity 1—1 InventoryBalance (composite key)

## 5. Status transitions

### Trade: DRAFT → CONFIRMED → COMPLETED, and DRAFT/CONFIRMED → CANCELLED
| From | To | Allowed | Guard |
|---|---|---|---|
| DRAFT | CONFIRMED | yes | all required fields present and valid |
| DRAFT | CANCELLED | yes | — |
| CONFIRMED | COMPLETED | yes | every shipment on the trade is DELIVERED, and sum(shipment.quantityMt) == trade.quantityMt (BR-4) |
| CONFIRMED | CANCELLED | yes | trade has **no shipments at all**, of any status (BR-10) — a PLANNED shipment must be deleted first (see the Shipment DELETE endpoint, section 7); once a shipment has left the warehouse or arrived (IN_TRANSIT/DELIVERED), it can never be deleted, so cancelling would require reversing inventory or discarding completed logistics, which is out of scope |
| COMPLETED | * | no | terminal |
| CANCELLED | * | no | terminal |
| DRAFT | COMPLETED | no | must pass through CONFIRMED |

### Shipment: PLANNED → IN_TRANSIT → DELIVERED
| From | To | Allowed | Guard |
|---|---|---|---|
| PLANNED | IN_TRANSIT | yes | parent trade status is CONFIRMED; sets actualDepartureDate (from the request body, or today if omitted; rejected if in the future); for a SELL trade, decrements warehouse stock (BR-3) — see note below |
| IN_TRANSIT | DELIVERED | yes | sets actualArrivalDate (from the request body, or today if omitted; rejected if in the future or before the shipment's actualDepartureDate); for a BUY trade, increments warehouse stock (BR-2) |
| PLANNED | DELIVERED | no | must pass through IN_TRANSIT |
| DELIVERED | * | no | terminal |
| any | PLANNED (backwards) | no | no backward transitions |

**Shipment deletion (not a status transition, product owner decision):**
a shipment may be deleted only while PLANNED; `DELETE` is rejected with
409 once it has reached IN_TRANSIT or DELIVERED. This is the mechanism
for clearing a PLANNED shipment that's blocking its trade's
cancellation (BR-10) — deletion is always safe with respect to
inventory, since no InventoryMovement can exist yet for a shipment
that hasn't reached IN_TRANSIT/DELIVERED. Planned shipments are never
deleted automatically by any other operation (e.g. cancelling a trade
never implicitly deletes its shipments).

**Inventory triggers, stated precisely (product owner decision 5):**
- A **purchase (BUY-trade) shipment moving to DELIVERED** increases
  stock at its **destination warehouse** (`shipment.warehouseId`) —
  goods have physically arrived. See BR-2.
- A **sale (SELL-trade) shipment moving to IN_TRANSIT** decreases
  stock at its **origin warehouse** (`shipment.warehouseId`) — goods
  have left that warehouse, which is when the seller's own stock is
  reduced. See BR-3.

This matches intent.md's "decreases when a sale shipment departs"
exactly, and uses the same `warehouseId` field for both directions —
the field's meaning (destination vs. origin) is determined by the
parent trade's `direction`, not by a separate field.

Invalid transitions (e.g. DELIVERED → PLANNED, or advancing a shipment
whose trade is still DRAFT) are rejected by the API with a 409 and a
clear message naming the current status and the attempted status
(standard 3).

## 6. Business rules

- **BR-1 (quantities/prices are decimals).** All `quantityMt` and
  `price` fields are stored and computed as fixed-point decimals, never
  binary floats, end to end (DB, ORM, API, UI). (Standard 1) This
  includes the wire format: the API accepts and returns `quantityMt`
  and `price` only as decimal strings (e.g. `"300.00"`), in both
  requests and responses — a JSON number in a request body is rejected
  with a 400, since parsing it would round-trip the value through a
  binary float before validation ever sees it.
- **BR-2 (purchase delivery increases stock at the destination
  warehouse).** When a Shipment on a BUY trade transitions to
  DELIVERED, create an InventoryMovement of `+quantityMt` for
  (warehouseId, commodityId) — `warehouseId` being the destination
  warehouse — and update InventoryBalance accordingly, atomically with
  the status change.
- **BR-3 (sale departure decreases stock at the origin warehouse,
  never below zero).** When a Shipment on a SELL trade transitions to
  IN_TRANSIT, check that InventoryBalance for (warehouseId,
  commodityId) — `warehouseId` being the origin warehouse — has at
  least `quantityMt` available; if not, reject the transition with a
  409 ("insufficient stock: available X MT, requested Y MT"). If
  sufficient, create an InventoryMovement of `-quantityMt` and update
  InventoryBalance atomically with the status change, and the DB
  `CHECK (quantityMt >= 0)` on InventoryBalance is the backstop.
  (Standard 4 — enforced backend-side, inside the same DB transaction
  as the status update, not merely checked in the UI before submit.)
- **BR-4 (shipment quantities reconcile to trade quantity at
  completion).** A trade may only move CONFIRMED → COMPLETED if the
  sum of its shipments' quantityMt equals its own quantityMt exactly,
  and every shipment is DELIVERED.
- **BR-4a (shipment quantities never exceed trade quantity).** On
  every Shipment create or edit, reject the request (400) if
  `sum(quantityMt of the trade's other shipments) + this shipment's
  quantityMt` would exceed the parent Trade's `quantityMt`. Checked
  independently of, and earlier than, BR-4's completion-time equality
  check.
- **BR-5 (no negative or zero quantities/prices).** Trade.quantityMt >
  0, Trade.price > 0, Shipment.quantityMt > 0, enforced by schema
  validation (standard 5) and DB constraints.
- **BR-6 (date ordering).** deliveryPeriodEnd ≥ deliveryPeriodStart on
  Trade; plannedArrivalDate ≥ plannedDepartureDate on Shipment;
  actualArrivalDate ≥ actualDepartureDate on Shipment (checked when
  actualArrivalDate is set, i.e. on deliver). Additionally,
  actualDepartureDate and actualArrivalDate may never be in the future
  (compared to the server's current **local calendar date, not UTC** —
  product owner decision, since a UTC "today" could disagree with the
  operator's own calendar date near a day boundary) — both are optional
  in the depart/deliver request body and default to today when omitted.
  Date-only fields are stored as date-only DB
  columns (Postgres `DATE`, no time component) and are represented on
  the wire as `"YYYY-MM-DD"` strings, in both requests and responses —
  never a full timestamp.
- **BR-7 (status transitions are whitelisted).** Only the transitions
  listed in section 5 are permitted; every other transition is
  rejected with an error naming both statuses. (Standard 3)
- **BR-8 (a shipment's warehouse+commodity is implied by its trade).**
  A Shipment doesn't store its own commodityId — it's read from
  `shipment.trade.commodityId` — so a shipment can never disagree with
  its trade's commodity.
- **BR-9 (reference data is fixed).** Counterparty and Warehouse rows
  are seed data in this version: no API creates, edits, or deletes
  them (decision 3), so there is no active/inactive or referential-
  integrity concern to enforce here. Revisit if editable lists are
  built later (section 10).
- **BR-10 (cancellation blocked once any shipment exists).** A Trade
  may only move CONFIRMED → CANCELLED if it has **no shipments at
  all**; otherwise reject with a 409 listing all of the trade's
  existing shipments (of any status — PLANNED, IN_TRANSIT or
  DELIVERED). (Product owner decision, tightened from an earlier draft
  that allowed cancelling with only PLANNED shipments.) A PLANNED
  shipment can be deleted (see section 7) to clear the block; an
  IN_TRANSIT or DELIVERED shipment can never be deleted, so
  cancellation is then permanently blocked — reversing inventory
  movements or discarding completed logistics is out of scope.
  Shipments are never deleted automatically as a side effect of any
  other operation, including a rejected or attempted cancel.
- **BR-11 (trade notes are optional, bounded, and DRAFT-only
  editable).** `Trade.notes` is an optional free-text field, schema-
  validated (standard 5) to at most 500 characters; a longer value is
  rejected with a 400 and a field-level error, nothing persisted.
  Whitespace-only input is trimmed and stored as `null`, same as
  omitting the field — there is no behavioral difference between "no
  notes" and "cleared notes." Like every other Trade field, `notes`
  can only be set (on create) or changed (via `PATCH`) while the trade
  is DRAFT; once CONFIRMED, COMPLETED or CANCELLED it is read-only.
  No note history is kept, and shipments have no notes field of their
  own (both out of scope — see section 10).

## 7. API endpoints

REST, JSON, all inputs schema-validated (standard 5), all mutations
that touch inventory or status wrapped in a DB transaction.

### Commodities
- `GET /api/commodities` — list

### Counterparties (seed data — read-only in this version, decision 3)
- `GET /api/counterparties` — list
- `GET /api/counterparties/:id`

### Warehouses (seed data — read-only in this version, decision 3)
- `GET /api/warehouses` — list
- `GET /api/warehouses/:id`

No create/edit/delete endpoints are offered for Counterparty or
Warehouse in this version; rows come from a seed script. See section
10 for the deferred editable-lists feature.

### Trades
- `GET /api/trades` — list, filterable by `status`, `commodityId`, `direction`, `counterpartyId`
- `POST /api/trades` — create (status defaults to DRAFT)
- `GET /api/trades/:id` — includes its shipments
- `PATCH /api/trades/:id` — edit fields, only while status is DRAFT
- `POST /api/trades/:id/confirm` — DRAFT → CONFIRMED
- `POST /api/trades/:id/complete` — CONFIRMED → COMPLETED (BR-4 checked)
- `POST /api/trades/:id/cancel` — DRAFT/CONFIRMED → CANCELLED (BR-10 checked: a CONFIRMED trade must have no shipments at all, of any status)

### Shipments
- `GET /api/shipments` — list, filterable by `status`, `tradeId`, `warehouseId`
- `POST /api/shipments` — create under a trade (status defaults to PLANNED; trade must be CONFIRMED; BR-4a checked)
- `GET /api/shipments/:id`
- `PATCH /api/shipments/:id` — edit fields, only while status is PLANNED (BR-4a re-checked if quantityMt changes); `tradeId` is immutable and not accepted
- `POST /api/shipments/:id/depart` — PLANNED → IN_TRANSIT (BR-3 applied if SELL); body may optionally include `actualDepartureDate` (`"YYYY-MM-DD"`, defaults to today; rejected if in the future)
- `POST /api/shipments/:id/deliver` — IN_TRANSIT → DELIVERED (BR-2 applied if BUY); body may optionally include `actualArrivalDate` (`"YYYY-MM-DD"`, defaults to today; rejected if in the future or before the shipment's actualDepartureDate)
- `DELETE /api/shipments/:id` — deletes a shipment, only while PLANNED (409 otherwise); this is how a PLANNED shipment that's blocking its trade's cancellation (BR-10) is cleared — never done automatically

### Inventory
- `GET /api/inventory` — current InventoryBalance rows, joined with warehouse/commodity names; excludes rows whose `quantityMt` is exactly zero (a warehouse+commodity pair drawn all the way down has no meaningful stock to show) — compared as a `Prisma.Decimal` value against the database column, in the backend, never as a string and never in the browser
- `GET /api/inventory/movements` — ledger, filterable by `warehouseId`, `commodityId`; unaffected by the zero-balance exclusion above — every movement is listed regardless of the balance it left behind, since it's a historical fact, not a current-stock figure

### Health
- `GET /api/health` — returns 200 with `{ status: "ok", db: "connected",
  commit }` when the database is reachable, 500 otherwise (no `commit`
  field in the error body). `commit` is Render's `RENDER_GIT_COMMIT`
  environment variable (the deployed commit's SHA) when present, or
  `"unknown"` when running locally. Used locally and, once deployed, as
  Render's `healthCheckPath` (section 11) — the contract this endpoint
  keeps (200 only when genuinely healthy) is load-bearing for every
  deploy, not just a developer convenience. The production deploy
  workflow (section 11) also polls this field to confirm the approved
  commit is actually the one serving traffic before it reports success.

### Dashboard
- `GET /api/dashboard/positions` — net position (bought − sold, in MT) per commodity, computed from CONFIRMED + COMPLETED trades; only commodities with at least one CONFIRMED or COMPLETED trade are listed (a commodity with none — no trades at all, or only DRAFT/CANCELLED ones — is omitted, not reported at zero)
- `GET /api/dashboard/inventory-summary` — stock by warehouse (same data as /api/inventory, including the zero-balance exclusion above, shaped for the dashboard widget)
- `GET /api/dashboard/shipments-in-progress` — shipments currently PLANNED or IN_TRANSIT

All endpoints return `404` for a missing id, `400` for validation
failures (with field-level messages), `409` for a rejected status
transition or an insufficient-stock rejection.

## 8. Screens

Sidebar navigation: Dashboard, Trades, Logistics, Inventory (standard
6). Counterparties and Warehouses are seed data in this version
(decision 3) — they have no dedicated screens and appear only as
dropdown options, populated from `GET /api/counterparties` and `GET
/api/warehouses`, on the Trade and Shipment forms.

- **Dashboard** — net position per commodity (bought MT − sold MT, one
  row per commodity); inventory by warehouse (table: warehouse ×
  commodity × MT); shipments in progress (table: trade, transport
  mode, origin → destination, status, planned dates).
- **Trades (list)** — table of trades: commodity, direction, counterparty,
  quantity, price, currency, delivery period, status; filters by
  status/commodity/direction/counterparty — the Counterparty dropdown
  sits after Direction, its options coming from `GET /api/counterparties`
  plus "All" (the default), per `intent/changes/006-counterparty-filters.md`;
  "New trade" button. A "Clear filters" button sits alongside the filters
  and is shown only while at least one of the four is active (not "All");
  clicking it resets all four to "All" and the list shows every trade
  again — per `intent/changes/004-clear-filters.md`, extended to the
  counterparty filter by `intent/changes/006-counterparty-filters.md`.
- **Trade detail / form** — all Trade fields; while DRAFT, fields are
  editable and Confirm/Cancel actions are shown; while CONFIRMED, shows
  Complete/Cancel actions and the list of linked shipments (with a
  link to add a new shipment); while COMPLETED/CANCELLED, read-only.
  A Cancel action on a CONFIRMED trade with any shipments (PLANNED,
  IN_TRANSIT or DELIVERED) is disabled/rejected per BR-10, with a
  message naming them; a PLANNED one must be deleted (via the Shipment
  detail screen's Delete action) before the trade can be cancelled.
  Validation errors appear next to the relevant field (standard 6).
  The optional `notes` field (free text, up to 500 characters) is
  editable alongside the other DRAFT fields and shown read-only
  afterward; it is not shown on the Trades list table (detail page
  only, per product owner decision).
- **Logistics (list)** — table of shipments across all trades: trade
  (linked), commodity, warehouse, transport mode, origin, destination,
  planned/actual dates, status; filters by status/warehouse. A "Clear
  filters" button sits alongside the filters and is shown only while at
  least one of the two is active (not "All"); clicking it resets both
  to "All" and the list shows every shipment again — per
  `intent/changes/005-clear-filters-logistics.md`.
- **Shipment detail / form** — all Shipment fields; while PLANNED,
  fields editable and "Depart" and "Delete" actions are shown; while
  IN_TRANSIT, a "Deliver" action is shown; while DELIVERED, read-only
  (no Delete action once past PLANNED). A quantity-exceeds-trade
  rejection on create/edit (BR-4a) and an insufficient-stock rejection
  on Depart (BR-3) are both shown as field-level errors on quantity.
- **Inventory** — table of current stock: warehouse, commodity,
  quantity MT (rows with a zero balance are omitted — see `GET
  /api/inventory` in section 7); below it, a movements ledger (date,
  warehouse, commodity, +/− MT, linked shipment) for traceability —
  the ledger lists every movement regardless of the resulting
  balance, unaffected by the current-stock table's zero-balance
  exclusion.

All table links use clear link text (e.g. "View trade", "View
shipment"), never a raw id or an unrelated data value repurposed as
the link (standard 9).

## 9. Acceptance criteria (mapped to "Success looks like")

**"A trade can be created, confirmed and completed end to end"**
- AC-1: Creating a trade via the form/API with valid fields results in
  a Trade with status DRAFT.
- AC-2: Confirming a DRAFT trade with all required fields present
  transitions it to CONFIRMED; confirming with missing/invalid fields
  is rejected with field-level errors.
- AC-3: Adding one or more shipments to a CONFIRMED trade, advancing
  each to DELIVERED, then calling complete when
  sum(shipment.quantityMt) == trade.quantityMt transitions the trade to
  COMPLETED.
- AC-4: Attempting to complete a trade whose shipment quantities don't
  sum to the trade quantity, or that has a non-DELIVERED shipment, is
  rejected with a 409 and a clear message.
- AC-4a: Creating or editing a shipment whose quantity would push the
  sum of the trade's shipment quantities above the trade quantity is
  rejected with a 400 and a clear message (BR-4a).
- AC-4b: Attempting to cancel a CONFIRMED trade that has any shipment,
  of any status (PLANNED, IN_TRANSIT or DELIVERED), is rejected with a
  409 listing all of them (BR-10); cancelling a trade with no
  shipments at all succeeds.
- AC-4c: Deleting a PLANNED shipment succeeds and removes it from its
  trade (and, once that was the trade's only shipment, clears AC-4b's
  block); deleting a shipment that is IN_TRANSIT or DELIVERED is
  rejected with a 409.

**"Delivering a purchase shipment increases the right warehouse's
stock"**
- AC-5: Delivering a shipment on a BUY trade increases
  InventoryBalance for that shipment's warehouse+commodity by exactly
  the shipment's quantityMt, and creates a matching InventoryMovement
  row.
- AC-6: Delivering a shipment on a BUY trade does not change any other
  warehouse's or commodity's balance.

**"The dashboard position matches the sum of confirmed trades"**
- AC-7: `/api/dashboard/positions` for a commodity equals
  sum(quantityMt of BUY trades in CONFIRMED or COMPLETED status) −
  sum(quantityMt of SELL trades in CONFIRMED or COMPLETED status) for
  that commodity; DRAFT and CANCELLED trades are excluded. A commodity
  with no CONFIRMED or COMPLETED trade at all does not appear in the
  response — it is omitted, not listed with a zero position.

**"Core business rules are covered by automated tests"**
- AC-8: Each rule BR-1 through BR-10 in section 6 has at least one
  automated backend test (standard 7), including: rejecting a SELL
  shipment departure that would take stock negative; rejecting an
  invalid status transition on Trade and on Shipment; rejecting a
  shipment create/edit that would exceed the trade quantity (BR-4a);
  rejecting a trade completion when shipment quantities don't
  reconcile (BR-4); rejecting a trade cancellation while it has any
  shipment (BR-10); rejecting a negative/zero quantity or price at the
  API layer.

**"Traders can add a free-text note to a trade"**
- AC-9: Creating or editing a DRAFT trade with a `notes` value up to
  500 characters succeeds and the value round-trips exactly through
  create/get; a value over 500 characters is rejected with a 400 and
  a field-level error, and nothing is persisted (BR-11).
- AC-10: Submitting a whitespace-only `notes` value is normalized and
  stored/returned as `null`, identical to omitting the field.
- AC-11: Attempting to change `notes` via `PATCH` once the trade is no
  longer DRAFT (CONFIRMED, COMPLETED or CANCELLED) is rejected, same
  as any other Trade field edit outside DRAFT.

**"Filters on the Trades list can be cleared with one click"**
- AC-12: With at least one of the Trades list's status/commodity/
  direction/counterparty filters set to a value other than "All", a
  "Clear filters" button is visible; clicking it resets all four
  filters to "All" and the list shows every trade again (matching the
  unfiltered `GET /api/trades` response).
- AC-13: With all four filters at "All" (none active, including right
  after Clear filters is clicked), the "Clear filters" button is not
  shown.

**"Trades with one counterparty can be found quickly"**
- AC-16: Filtering the Trades list by a counterparty shows only that
  counterparty's trades, matching `GET /api/trades?counterpartyId=...`;
  combined with another active filter (e.g. status), only trades
  satisfying both are shown.
- AC-17: The counterparty filter choice is kept in the URL and survives
  a page refresh, same as the existing status/commodity/direction
  filters.

**"Filters on the Logistics list can be cleared with one click"**
- AC-14: With at least one of the Logistics list's status/warehouse
  filters set to a value other than "All", a "Clear filters" button is
  visible; clicking it resets both filters to "All" and the list shows
  every shipment again (matching the unfiltered `GET /api/shipments`
  response).
- AC-15: With both filters at "All" (none active, including right
  after Clear filters is clicked), the "Clear filters" button is not
  shown.

## 10. Out of scope / future intent

- **Editable Counterparty and Warehouse lists.** Decision 3 (section
  2) defers CRUD screens, create/edit/delete APIs, and any active/
  inactive (soft-delete) concept for Counterparty and Warehouse to a
  future version. This version uses fixed seed data, exposed only via
  read-only `GET` endpoints. When this is picked up later, revisit
  BR-9 and the "reference data integrity" concern that was removed
  from section 3 in this revision (hard-delete-while-referenced would
  become a real risk again).
- **Inventory reversal on late cancellation.** BR-10 disallows
  cancelling a trade once any shipment is IN_TRANSIT or DELIVERED.
  Supporting cancellation past that point would require reversing
  InventoryMovement entries and is deferred.
- **Notes on shipments, and note history/audit trail.** Per the trade-
  notes change request (`intent/changes/001-trade-notes.md`): Shipment
  has no `notes` field, and `Trade.notes` keeps no edit history — only
  the current value is stored, same as every other Trade field.

## 11. Deployment

Per `intent/changes/008-deploy-demo.md`: this app is deployed as a
short-lived public demo (fake data only, no login — consistent with
`intent/intent.md`'s "runs locally, no login," now made reachable
online), not a production business system. Decisions (also recorded as
section 2, decisions 7-9):

- **Hosting:** Render, two web services (`ctrm-staging`,
  `ctrm-production`), both defined in a committed `render.yaml`
  Blueprint (infrastructure as code) rather than manual dashboard
  setup.
- **Database:** one free Render Postgres instance (Render's free tier
  allows only one per workspace: 1 GB, expires 30 days after creation,
  14-day grace period before deletion). It holds two logical databases,
  `ctrm_staging` and `ctrm_production` — the same one-instance/two-
  databases pattern already used locally for `ctrm_dev`/`ctrm_test`
  (`docker-compose.yml`). Creating the second logical database is a
  one-time manual step (not expressible in `render.yaml`, which only
  wires one connection string per database resource). Both environments
  share the same 30-day expiry clock and are recreated together;
  accepted since both only ever hold demo data (decision 7).
- **Serving:** the backend serves the built frontend (`frontend/dist`)
  as static files in production, with an SPA fallback for client-side
  routes, so there's no Vite dev proxy and no CORS middleware in
  production — the frontend keeps calling relative `/api/...` paths,
  unchanged from local dev. Active only when `NODE_ENV === "production"`;
  local dev is unaffected.
- **Migrations:** `prisma migrate deploy` (never `migrate reset`) runs
  as part of the production start command, before the server starts
  listening — not a separate Render "Pre-Deploy Command" or one-off
  job, since Render's free tier offers neither. It's idempotent, so
  running it on every boot (including every cold-start wake from sleep)
  is safe.
- **Seed:** `backend/prisma/seed.ts` (reference data only — Commodity,
  Counterparty, Warehouse) also runs on every boot, immediately after
  migrations. It's already upsert-based (phase 1 of the plan), so
  repeated runs never duplicate rows.
- **Demo data reset:** Trade/Shipment/Inventory data is never wiped
  automatically — only the reference-data seed above runs on its own.
  A reset mechanism of any kind (manual or scheduled) is out of scope
  for this version (decision 8).
- **Pipeline:** merging to `main` deploys `ctrm-staging` automatically
  — Render's own `autoDeployTrigger: checksPass` waits for GitHub's CI
  check to pass before deploying, so no separate GitHub Actions step
  triggers staging. `ctrm-production` never auto-deploys; it's deployed
  only by a GitHub Actions job (`.github/workflows/deploy-production.yml`)
  gated on a `production` GitHub Environment with a required human
  reviewer, which then calls the production service's Render deploy
  hook. Render's deploy hook always deploys whatever is currently the
  tip of `main` — it has no way to target an older, specific commit —
  so the workflow cancels a still-pending approval run the moment a
  newer commit's CI finishes (a `concurrency` group), and double-checks
  immediately before calling the hook that `main` hasn't moved since the
  run was queued, failing instead of deploying if it has.
- **Smoke test:** both services set `healthCheckPath: /api/health` in
  `render.yaml` (see section 7's Health endpoint) — Render itself won't
  route traffic to a new deploy until that path responds with 200, so
  every deploy (and every rollback) is gated on the existing health
  check with no extra code. The production deploy workflow adds a
  stronger check on top of that: after calling the deploy hook, it polls
  `/api/health` for up to 15 minutes until the `commit` field matches the
  approved commit's SHA, failing the workflow run if it never does — this
  also covers a sleeping free-tier service taking close to a minute to
  wake and serve the new version.
- **Rollback:** `npm run rollback -- <commit-sha>`, which runs `git
  revert <sha> --no-edit && git push origin main` — this re-enters the
  same pipeline as a normal change (CI, staging auto-deploy,
  approval-gated production deploy) rather than a second,
  separately-maintained mechanism. Practiced on staging before it's
  ever needed on production (decision 9).
- **Secrets:** `DATABASE_URL` for each environment lives only as a
  Render environment variable (wired via `render.yaml`'s `fromDatabase`
  where possible); the production deploy hook URL lives only as a
  GitHub Actions secret scoped to the `production` Environment. Neither
  is ever committed to the repo or placed in `.env.example`'s committed
  defaults.
- **Claude Code guardrail:** a fourth `PreToolUse` hook (alongside
  `intent/changes/007-guardrail-hooks.md`'s three) blocks Claude from
  directly calling the production deploy hook, from approving the
  `production` Environment's pending-deployment gate, or from using
  Render's CLI/API to deploy or roll back `ctrm-production` directly
  (the same action via a different surface) — a human must trigger
  and approve every production deploy. A Render CLI/API deploy-or-
  rollback call naming some other or unspecified service pauses for
  approval instead of being blocked outright, since the hook has no
  way to resolve a raw service ID to a service name.
- **Repository visibility:** the GitHub repo was made public, because
  GitHub's required-reviewers feature for Environments is not
  available on private repos under the free plan — a required
  reviewer on `production` (above) needs it. Trade-offs accepted: the
  code and commit history are publicly visible; secrets themselves
  stay out of the repo regardless (held in Render and in GitHub
  Actions secrets, never committed); and GitHub requires approval to
  run workflows on pull requests from first-time external
  contributors to a public repo (fork PR workflows don't run
  unattended).
- **`production` Environment configuration:** requires at least one
  reviewer (decision above), restricted to deploy only from the
  `main` branch, and holds two pieces of configuration scoped to it —
  the Render production deploy hook URL as a secret
  (`RENDER_PRODUCTION_DEPLOY_HOOK`) and the production URL as a
  variable (`PRODUCTION_URL`, used by the workflow's smoke-test
  step).
- **Incident:** the first production deploy ran without pausing for
  approval, because the `production` Environment's required-reviewer
  rule had not actually been saved yet when the workflow merged to
  `main`. It failed closed rather than shipping anything, only because
  `RENDER_PRODUCTION_DEPLOY_HOOK` also hadn't been set yet, so the
  deploy step had no URL to call. Lesson: create and confirm the
  protected Environment (reviewer rule, branch restriction, secrets)
  *before* merging a workflow that depends on it, not after — don't
  rely on a missing secret as a safety net.

Out of scope for this version (per `intent/changes/008-deploy-demo.md`):
login/user accounts, real business data, a custom domain, and Claude
running inside the deploy pipeline itself.

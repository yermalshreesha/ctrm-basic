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
| name | string | unique, e.g. "Wheat", "Arabica Coffee", "Sugar ICUMSA 45" |
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
- `GET /api/trades` — list, filterable by `status`, `commodityId`, `direction`
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
- `GET /api/inventory` — current InventoryBalance rows, joined with warehouse/commodity names
- `GET /api/inventory/movements` — ledger, filterable by `warehouseId`, `commodityId`

### Dashboard
- `GET /api/dashboard/positions` — net position (bought − sold, in MT) per commodity, computed from CONFIRMED + COMPLETED trades; only commodities with at least one CONFIRMED or COMPLETED trade are listed (a commodity with none — no trades at all, or only DRAFT/CANCELLED ones — is omitted, not reported at zero)
- `GET /api/dashboard/inventory-summary` — stock by warehouse (same data as /api/inventory, shaped for the dashboard widget)
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
  status/commodity/direction; "New trade" button.
- **Trade detail / form** — all Trade fields; while DRAFT, fields are
  editable and Confirm/Cancel actions are shown; while CONFIRMED, shows
  Complete/Cancel actions and the list of linked shipments (with a
  link to add a new shipment); while COMPLETED/CANCELLED, read-only.
  A Cancel action on a CONFIRMED trade with any shipments (PLANNED,
  IN_TRANSIT or DELIVERED) is disabled/rejected per BR-10, with a
  message naming them; a PLANNED one must be deleted (via the Shipment
  detail screen's Delete action) before the trade can be cancelled.
  Validation errors appear next to the relevant field (standard 6).
- **Logistics (list)** — table of shipments across all trades: trade
  (linked), commodity, warehouse, transport mode, origin, destination,
  planned/actual dates, status; filters by status/warehouse.
- **Shipment detail / form** — all Shipment fields; while PLANNED,
  fields editable and "Depart" and "Delete" actions are shown; while
  IN_TRANSIT, a "Deliver" action is shown; while DELIVERED, read-only
  (no Delete action once past PLANNED). A quantity-exceeds-trade
  rejection on create/edit (BR-4a) and an insufficient-stock rejection
  on Depart (BR-3) are both shown as field-level errors on quantity.
- **Inventory** — table of current stock: warehouse, commodity,
  quantity MT; below it, a movements ledger (date, warehouse,
  commodity, +/− MT, linked shipment) for traceability.

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

## 11. Unresolved (cannot answer from intent.md)

- Whether PostgreSQL (as proposed) or SQLite (lighter local-only setup,
  no separate DB server to install) is preferred for a single-user
  local learning app — flagged in section 1; both satisfy the
  skill's Prisma/decimal requirements equally.

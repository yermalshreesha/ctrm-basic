import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { formatZodError } from "../../shared/validation.js";
import { recordMovementSchema } from "./schema.js";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; status: number; body: Record<string, unknown> };
export type Result<T> = Ok<T> | Err;

export function insufficientStock(available: Prisma.Decimal, requested: Prisma.Decimal): Err {
  return {
    ok: false,
    status: 409,
    body: {
      error: "insufficient_stock",
      message: `insufficient stock: available ${available.toFixed(3)} MT, requested ${requested
        .abs()
        .toFixed(3)} MT`,
    },
  };
}

export function duplicateMovement(shipmentId: string): Err {
  return {
    ok: false,
    status: 409,
    body: {
      error: "duplicate_movement",
      message: `A movement has already been recorded for shipment ${shipmentId}`,
    },
  };
}

// A negative balance that slips past the app-level pre-check below (only
// possible under a race between two concurrent movements against the same
// warehouse+commodity — see the "concurrent removals" test) is still
// caught here: it surfaces as the DB CHECK constraint violation, thrown
// inside the transaction, caught below.
export class InsufficientStockInTransaction extends Error {
  constructor(
    readonly available: Prisma.Decimal,
    readonly requested: Prisma.Decimal,
  ) {
    super("insufficient stock");
  }
}

export interface RecordMovementInput {
  warehouseId: string;
  commodityId: string;
  shipmentId: string;
  quantityMt: string;
}

export function balanceKey(warehouseId: string, commodityId: string) {
  return { warehouseId_commodityId: { warehouseId, commodityId } };
}

export interface RecordMovementInTransactionInput {
  warehouseId: string;
  commodityId: string;
  shipmentId: string;
  quantityMt: Prisma.Decimal;
}

// The trusted, transaction-composable core of recordMovement: assumes
// warehouseId/commodityId/shipmentId are already known to be valid (the
// caller already read them off a row of its own) and quantityMt is already
// a Prisma.Decimal within DECIMAL(12,3) bounds — no schema validation runs
// here. Runs inside a caller-supplied `tx` so it can be composed atomically
// with another mutation in the same transaction — e.g. a Shipment status
// change, per BR-2/BR-3's "atomically with the status change"
// (backend/src/modules/shipments/service.ts). Throws
// InsufficientStockInTransaction for the app-level never-negative check;
// lets Prisma's own conflict errors (unique-constraint P2002, CHECK P2004)
// bubble uncaught for the caller to map, typically via isUniqueConflict/
// isBalanceCheckViolation below.
export async function recordMovementInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordMovementInTransactionInput,
): Promise<{
  movement: Prisma.InventoryMovementGetPayload<object>;
  balance: Prisma.InventoryBalanceGetPayload<object>;
}> {
  const { warehouseId, commodityId, shipmentId, quantityMt: delta } = input;

  const existing = await tx.inventoryBalance.findUnique({
    where: balanceKey(warehouseId, commodityId),
  });
  const current = existing?.quantityMt ?? new Prisma.Decimal(0);
  const projected = current.plus(delta);
  if (projected.isNegative()) {
    throw new InsufficientStockInTransaction(current, delta);
  }

  const movement = await tx.inventoryMovement.create({
    data: { warehouseId, commodityId, shipmentId, quantityMt: delta },
  });

  // Deliberately not upsert(): Postgres validates a CHECK constraint
  // against the raw proposed INSERT values of an `INSERT ... ON CONFLICT
  // DO UPDATE` *before* it even knows whether the conflict branch will
  // run — so a legitimate decrease against an existing balance (e.g. 50 +
  // (-20) = 30, a valid result) would still be rejected, because the
  // discarded "insert quantityMt = -20" proposal alone fails quantityMt >=
  // 0. A plain create-or-update only ever validates the actual resulting
  // row, not a discarded proposal.
  const balance = existing
    ? await tx.inventoryBalance.update({
        where: balanceKey(warehouseId, commodityId),
        data: { quantityMt: { increment: delta } },
      })
    : await tx.inventoryBalance.create({
        data: { warehouseId, commodityId, quantityMt: delta },
      });

  return { movement, balance };
}

// The single stock-mutation entry point (ctrm-standards #4, CLAUDE.md "all
// stock changes go through the inventory service, inside a transaction").
// Validates warehouseId/commodityId (valid UUIDs that exist — same
// approach as trades/schema.ts) and quantityMt (decimal, signed, at most 3
// places, at most 9 integer digits to fit DECIMAL(12,3)) before writing
// anything, so a bad caller-supplied id or an oversized quantity comes back
// as a 400, not a raw FK/numeric-overflow constraint violation surfacing as
// a 500. Creates an InventoryMovement row and updates the matching
// InventoryBalance atomically, via recordMovementInTransaction above. See
// the plain-English writeup in the conversation that approved this phase
// for how the never-negative guarantee holds under concurrent calls: an
// app-level pre-check rejects the common case before writing anything, and
// the DB CHECK constraint on InventoryBalance is the backstop for the race
// case, translated back into the same insufficient-stock error rather than
// surfacing as a raw constraint-violation error.
export async function recordMovement(input: RecordMovementInput): Promise<
  Result<{
    movement: Prisma.InventoryMovementGetPayload<object>;
    balance: Prisma.InventoryBalanceGetPayload<object>;
  }>
> {
  const parsed = await recordMovementSchema.safeParseAsync(input);
  if (!parsed.success) {
    return { ok: false, status: 400, body: formatZodError(parsed.error) };
  }
  const { warehouseId, commodityId, shipmentId } = parsed.data;
  const delta = new Prisma.Decimal(parsed.data.quantityMt);

  async function attempt() {
    return prisma.$transaction((tx) =>
      recordMovementInTransaction(tx, { warehouseId, commodityId, shipmentId, quantityMt: delta }),
    );
  }

  try {
    let outcome;
    try {
      outcome = await attempt();
    } catch (err) {
      // Two concurrent *first* movements for a warehouse+commodity pair
      // that has no balance row yet can both try to INSERT it — Postgres
      // lets one through and reports a primary-key conflict to the other.
      // Retry once: the row now exists (created by the winner), so this
      // becomes a plain increment, and the two calls' amounts correctly
      // sum instead of one being lost.
      if (isUniqueConflict(err, ["warehouseId", "commodityId"])) {
        outcome = await attempt();
      } else {
        throw err;
      }
    }
    return { ok: true, data: outcome };
  } catch (err) {
    if (err instanceof InsufficientStockInTransaction) {
      return insufficientStock(err.available, err.requested);
    }
    if (isUniqueConflict(err, ["shipmentId"])) {
      return duplicateMovement(shipmentId);
    }
    if (isBalanceCheckViolation(err)) {
      // Only the InventoryBalance.quantityMt >= 0 constraint can fail here
      // (a concurrent movement won the race — see the module docstring
      // above), so re-fetch the now-current balance for the error message.
      const current = await prisma.inventoryBalance.findUnique({
        where: balanceKey(warehouseId, commodityId),
      });
      return insufficientStock(current?.quantityMt ?? new Prisma.Decimal(0), delta);
    }
    throw err;
  }
}

// Unifies the two P2002 (unique constraint violated) checks this service
// needs: the InventoryBalance composite primary key (warehouseId +
// commodityId) and the InventoryMovement.shipmentId unique index. True
// when every one of `fields` is among the columns Prisma reports as the
// conflicting constraint. meta.target is normally an array of column
// names, but a single string is handled defensively too. Exported so
// shipments/service.ts can apply the same mapping to conflicts raised by
// recordMovementInTransaction when composed inside its own transaction.
export function isUniqueConflict(err: unknown, fields: string[]): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  const targets = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  return fields.every((field) => targets.includes(field));
}

const BALANCE_CHECK_CONSTRAINT = "InventoryBalance_quantityMt_nonnegative";

// P2004 ("A constraint failed on the database") is the generic code Prisma
// uses for a CHECK constraint it has no specific code for, and is how this
// violation is normally reported. But observed empirically under the
// "concurrent removals" race: the same underlying Postgres error (SQLSTATE
// 23514) raised by an UPDATE mid-interactive-transaction is sometimes
// instead wrapped as a PrismaClientUnknownRequestError, not classified as
// P2004 — a Prisma quirk, not something this service can prevent.
// Recognized by the constraint's name either way, so the race case always
// comes back as insufficient-stock, never an unhandled 500.
export function isBalanceCheckViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2004") return true;
  return err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes(BALANCE_CHECK_CONSTRAINT);
}

export interface ListMovementsFilters {
  warehouseId?: string;
  commodityId?: string;
}

// Excludes balances of exactly zero — a warehouse+commodity pair that's
// been fully drawn down has no meaningful stock to show on the Inventory
// screen or the dashboard's inventory-by-warehouse widget (both call this
// function; GET /api/dashboard/inventory-summary reuses it as-is, per
// dashboard/routes.ts). The comparison is a Prisma.Decimal value compared
// against the DECIMAL(12,3) column in the database — never a string
// comparison, and never done in the browser. The movements ledger
// (listMovements, below) is unaffected: it lists every movement
// regardless of the balance it left behind.
export function listBalances() {
  return prisma.inventoryBalance.findMany({
    where: { quantityMt: { not: new Prisma.Decimal(0) } },
    include: { warehouse: true, commodity: true },
    orderBy: [{ warehouseId: "asc" }, { commodityId: "asc" }],
  });
}

export function listMovements(filters: ListMovementsFilters) {
  return prisma.inventoryMovement.findMany({
    where: { warehouseId: filters.warehouseId, commodityId: filters.commodityId },
    include: { warehouse: true, commodity: true },
    orderBy: { createdAt: "desc" },
  });
}

export function serializeBalance(
  balance: Prisma.InventoryBalanceGetPayload<{ include: { warehouse: true; commodity: true } }>,
) {
  return {
    warehouseId: balance.warehouseId,
    warehouseName: balance.warehouse.name,
    commodityId: balance.commodityId,
    commodityName: balance.commodity.name,
    quantityMt: balance.quantityMt.toFixed(3),
    updatedAt: balance.updatedAt,
  };
}

export function serializeMovement(
  movement: Prisma.InventoryMovementGetPayload<{ include: { warehouse: true; commodity: true } }>,
) {
  return {
    id: movement.id,
    warehouseId: movement.warehouseId,
    warehouseName: movement.warehouse.name,
    commodityId: movement.commodityId,
    commodityName: movement.commodity.name,
    shipmentId: movement.shipmentId,
    quantityMt: movement.quantityMt.toFixed(3),
    createdAt: movement.createdAt,
  };
}

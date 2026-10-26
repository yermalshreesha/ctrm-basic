import { Prisma, type TradeDirection, type TradeStatus } from "@prisma/client";
import { prisma } from "../../db.js";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; status: number; body: Record<string, unknown> };
export type Result<T> = Ok<T> | Err;

function notFound(message: string): Err {
  return { ok: false, status: 404, body: { error: "not_found", message } };
}

function invalidTransition(from: string, to: string): Err {
  return {
    ok: false,
    status: 409,
    body: {
      error: "invalid_transition",
      message: `Cannot transition trade from ${from} to ${to}`,
    },
  };
}

function notEditable(status: string): Err {
  return {
    ok: false,
    status: 409,
    body: {
      error: "not_editable",
      message: `Cannot edit trade while status is ${status}`,
    },
  };
}

function fieldError(field: string, message: string): Err {
  return {
    ok: false,
    status: 400,
    body: { error: "validation_failed", fields: [{ field, message }] },
  };
}

// Thrown inside completeTrade/cancelTrade's transaction (after the trade
// row lock is acquired) and mapped back to a Result in the outer catch —
// same "throw inside tx, map outside" shape as shipments/service.ts.
class TradeMissingInTransaction extends Error {
  constructor(readonly tradeId: string) {
    super("trade not found");
  }
}

class InvalidTransitionInTransaction extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super("invalid transition");
  }
}

class ShipmentsExistInTransaction extends Error {
  constructor(readonly shipmentIds: string[]) {
    super("shipments exist");
  }
}

class CannotCompleteInTransaction extends Error {
  constructor(
    readonly shippedTotal: Prisma.Decimal,
    readonly tradeQuantityMt: Prisma.Decimal,
    readonly allDelivered: boolean,
  ) {
    super("cannot complete trade");
  }
}

export interface CreateTradeInput {
  commodityId: string;
  direction: "BUY" | "SELL";
  counterpartyId: string;
  quantityMt: string;
  price: string;
  currency: "USD" | "EUR" | "GBP";
  deliveryPeriodStart: Date;
  deliveryPeriodEnd: Date;
  notes?: string | null;
}

export type PatchTradeInput = Partial<CreateTradeInput>;

export interface ListTradesFilters {
  status?: TradeStatus;
  commodityId?: string;
  direction?: TradeDirection;
  counterpartyId?: string;
}

// Prisma's Decimal.toString()/toJSON() normalizes away trailing zeros
// (new Decimal("300.00").toString() === "300"), which would silently drop
// the DECIMAL(12,3)/(12,2) column's fixed scale from API responses. Format
// explicitly so quantityMt/price always come back with the scale spec's
// data model declares, e.g. "300.00", not "300" (BR-1).
export function serializeTrade(trade: Prisma.TradeGetPayload<object>) {
  return {
    ...trade,
    quantityMt: trade.quantityMt.toFixed(3),
    price: trade.price.toFixed(2),
    deliveryPeriodStart: formatDateOnly(trade.deliveryPeriodStart),
    deliveryPeriodEnd: formatDateOnly(trade.deliveryPeriodEnd),
  };
}

// deliveryPeriodStart/End are @db.Date columns — Prisma returns them as
// JS Date objects, which JSON.stringify would otherwise render as a full
// timestamp (e.g. "2026-01-01T00:00:00.000Z"). Format as the date-only
// "YYYY-MM-DD" string the column actually stores.
function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function listTrades(filters: ListTradesFilters) {
  return prisma.trade.findMany({
    where: {
      status: filters.status,
      commodityId: filters.commodityId,
      direction: filters.direction,
      counterpartyId: filters.counterpartyId,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getTradeById(id: string) {
  return prisma.trade.findUnique({ where: { id } });
}

// GET /api/trades/:id includes its shipments (spec §7) — the list
// endpoint doesn't, so this is a separate query rather than baked into
// getTradeById. Shipments are nested with warehouse/trade/commodity so
// each can be run straight through shipments/service.ts's own
// serializeShipment, instead of a second, divergent serializer.
export function getTradeByIdWithShipments(id: string) {
  return prisma.trade.findUnique({
    where: { id },
    include: { shipments: { include: { warehouse: true, trade: { include: { commodity: true } } } } },
  });
}

export async function createTrade(input: CreateTradeInput) {
  return prisma.trade.create({
    data: {
      commodityId: input.commodityId,
      direction: input.direction,
      counterpartyId: input.counterpartyId,
      quantityMt: input.quantityMt,
      price: input.price,
      currency: input.currency,
      deliveryPeriodStart: input.deliveryPeriodStart,
      deliveryPeriodEnd: input.deliveryPeriodEnd,
      notes: input.notes,
      status: "DRAFT",
    },
  });
}

export async function patchTrade(id: string, input: PatchTradeInput): Promise<Result<Prisma.TradeGetPayload<object>>> {
  const trade = await getTradeById(id);
  if (!trade) return notFound(`Trade ${id} not found`);
  if (trade.status !== "DRAFT") return notEditable(trade.status);

  const mergedStart = input.deliveryPeriodStart ?? trade.deliveryPeriodStart;
  const mergedEnd = input.deliveryPeriodEnd ?? trade.deliveryPeriodEnd;
  if (mergedEnd.getTime() < mergedStart.getTime()) {
    // Blame whichever date field the client actually submitted — if only
    // deliveryPeriodEnd was sent, it's the one that now conflicts with the
    // already-stored deliveryPeriodStart, and vice versa. If both were
    // sent, blame deliveryPeriodEnd, matching createTradeSchema.
    const conflictField = input.deliveryPeriodEnd !== undefined ? "deliveryPeriodEnd" : "deliveryPeriodStart";
    return fieldError(conflictField, "deliveryPeriodEnd must be on or after deliveryPeriodStart");
  }

  const updated = await prisma.trade.update({
    where: { id },
    data: {
      commodityId: input.commodityId,
      direction: input.direction,
      counterpartyId: input.counterpartyId,
      quantityMt: input.quantityMt,
      price: input.price,
      currency: input.currency,
      deliveryPeriodStart: input.deliveryPeriodStart,
      deliveryPeriodEnd: input.deliveryPeriodEnd,
      notes: input.notes,
    },
  });
  return { ok: true, data: updated };
}

export async function confirmTrade(id: string): Promise<Result<Prisma.TradeGetPayload<object>>> {
  const trade = await getTradeById(id);
  if (!trade) return notFound(`Trade ${id} not found`);
  if (trade.status !== "DRAFT") return invalidTransition(trade.status, "CONFIRMED");

  const updated = await prisma.trade.update({ where: { id }, data: { status: "CONFIRMED" } });
  return { ok: true, data: updated };
}

// BR-4: both conditions are required together — every shipment DELIVERED,
// AND their quantities summing exactly to the trade quantity. A trade
// with zero shipments fails both trivially (sum 0, nothing DELIVERED),
// so it's rejected without a special case.
//
// Runs inside a transaction that locks the trade row first (SELECT ... FOR
// UPDATE, same pattern as shipments/service.ts's createShipment), so a
// shipment can't be created (or the trade cancelled) concurrently between
// this reading the shipment list and committing COMPLETED — without the
// lock, a shipment inserted mid-check could leave a COMPLETED trade with a
// non-DELIVERED shipment attached, silently invalidating the check this
// function just ran.
export async function completeTrade(id: string): Promise<Result<Prisma.TradeGetPayload<object>>> {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trade" WHERE id = ${id} FOR UPDATE`;
      const trade = await tx.trade.findUnique({ where: { id } });
      if (!trade) throw new TradeMissingInTransaction(id);
      if (trade.status !== "CONFIRMED") throw new InvalidTransitionInTransaction(trade.status, "COMPLETED");

      const shipments = await tx.shipment.findMany({ where: { tradeId: id } });
      const allDelivered = shipments.length > 0 && shipments.every((s) => s.status === "DELIVERED");
      const shippedTotal = shipments.reduce((total, s) => total.plus(s.quantityMt), new Prisma.Decimal(0));
      const sumMatches = shippedTotal.equals(trade.quantityMt);

      if (!allDelivered || !sumMatches) {
        throw new CannotCompleteInTransaction(shippedTotal, trade.quantityMt, allDelivered);
      }

      return tx.trade.update({ where: { id }, data: { status: "COMPLETED" } });
    });
    return { ok: true, data: updated };
  } catch (err) {
    if (err instanceof TradeMissingInTransaction) return notFound(`Trade ${err.tradeId} not found`);
    if (err instanceof InvalidTransitionInTransaction) return invalidTransition(err.from, err.to);
    if (err instanceof CannotCompleteInTransaction) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "cannot_complete",
          message: `Cannot complete trade: shipments total ${err.shippedTotal.toFixed(3)} MT of ${err.tradeQuantityMt.toFixed(3)} MT, all DELIVERED: ${err.allDelivered}`,
        },
      };
    }
    throw err;
  }
}

// BR-10 (tightened, product owner decision 2026-09-25 — see spec.md): a
// CONFIRMED trade can only be cancelled if it has no shipments at all, of
// any status. A PLANNED shipment must be deleted first (DELETE
// /api/shipments/:id) — never automatically, here or anywhere else.
//
// Runs inside a transaction that locks the trade row first (SELECT ... FOR
// UPDATE, same pattern as shipments/service.ts's createShipment) — without
// it, a shipment could be created concurrently between this reading "no
// shipments" and committing CANCELLED, leaving a CANCELLED trade with a
// shipment attached. Locking the same row createShipment locks serializes
// the two against each other: whichever transaction's lock is granted
// first commits, and the other one re-reads the now-current state and is
// correctly rejected (either "trade not confirmed" or "shipments exist").
export async function cancelTrade(id: string): Promise<Result<Prisma.TradeGetPayload<object>>> {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trade" WHERE id = ${id} FOR UPDATE`;
      const trade = await tx.trade.findUnique({ where: { id } });
      if (!trade) throw new TradeMissingInTransaction(id);
      if (trade.status !== "DRAFT" && trade.status !== "CONFIRMED") {
        throw new InvalidTransitionInTransaction(trade.status, "CANCELLED");
      }

      if (trade.status === "CONFIRMED") {
        const shipments = await tx.shipment.findMany({ where: { tradeId: id } });
        if (shipments.length > 0) {
          throw new ShipmentsExistInTransaction(shipments.map((s) => s.id));
        }
      }

      return tx.trade.update({ where: { id }, data: { status: "CANCELLED" } });
    });
    return { ok: true, data: updated };
  } catch (err) {
    if (err instanceof TradeMissingInTransaction) return notFound(`Trade ${err.tradeId} not found`);
    if (err instanceof InvalidTransitionInTransaction) return invalidTransition(err.from, err.to);
    if (err instanceof ShipmentsExistInTransaction) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "shipments_exist",
          message: `Cannot cancel trade: it has ${err.shipmentIds.length} shipment(s) attached — delete any PLANNED ones first`,
          shipmentIds: err.shipmentIds,
        },
      };
    }
    throw err;
  }
}

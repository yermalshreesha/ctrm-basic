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

export interface CreateTradeInput {
  commodityId: string;
  direction: "BUY" | "SELL";
  counterpartyId: string;
  quantityMt: string;
  price: string;
  currency: "USD" | "EUR" | "GBP";
  deliveryPeriodStart: Date;
  deliveryPeriodEnd: Date;
}

export type PatchTradeInput = Partial<CreateTradeInput>;

export interface ListTradesFilters {
  status?: TradeStatus;
  commodityId?: string;
  direction?: TradeDirection;
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
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getTradeById(id: string) {
  return prisma.trade.findUnique({ where: { id } });
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

export async function cancelTrade(id: string): Promise<Result<Prisma.TradeGetPayload<object>>> {
  const trade = await getTradeById(id);
  if (!trade) return notFound(`Trade ${id} not found`);
  if (trade.status !== "DRAFT" && trade.status !== "CONFIRMED") {
    return invalidTransition(trade.status, "CANCELLED");
  }

  const updated = await prisma.trade.update({ where: { id }, data: { status: "CANCELLED" } });
  return { ok: true, data: updated };
}

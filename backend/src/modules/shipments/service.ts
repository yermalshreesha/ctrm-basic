import { Prisma, type ShipmentStatus, type TransportMode } from "@prisma/client";
import { prisma } from "../../db.js";
import {
  InsufficientStockInTransaction,
  balanceKey,
  duplicateMovement,
  insufficientStock,
  isBalanceCheckViolation,
  isUniqueConflict,
  recordMovementInTransaction,
} from "../inventory/service.js";

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
      message: `Cannot transition shipment from ${from} to ${to}`,
    },
  };
}

function notEditable(status: string): Err {
  return {
    ok: false,
    status: 409,
    body: { error: "not_editable", message: `Cannot edit shipment while status is ${status}` },
  };
}

function notDeletable(status: string): Err {
  return {
    ok: false,
    status: 409,
    body: { error: "not_deletable", message: `Cannot delete shipment while status is ${status}` },
  };
}

function tradeNotConfirmed(status: string): Err {
  return {
    ok: false,
    status: 409,
    body: { error: "trade_not_confirmed", message: `Trade status is ${status}, not CONFIRMED` },
  };
}

function fieldError(field: string, message: string): Err {
  return {
    ok: false,
    status: 400,
    body: { error: "validation_failed", fields: [{ field, message }] },
  };
}

type ShipmentWithRelations = Prisma.ShipmentGetPayload<{
  include: { warehouse: true; trade: { include: { commodity: true } } };
}>;

// Prisma's Decimal.toString()/toJSON() normalizes away trailing zeros —
// see trades/service.ts's serializeTrade for the same note (BR-1).
export function serializeShipment(shipment: ShipmentWithRelations) {
  return {
    id: shipment.id,
    tradeId: shipment.tradeId,
    // BR-8: commodity is always read from the trade, never a stored
    // column of its own — exposed here purely as a derived/joined field.
    commodityId: shipment.trade.commodityId,
    commodityName: shipment.trade.commodity.name,
    warehouseId: shipment.warehouseId,
    warehouseName: shipment.warehouse.name,
    quantityMt: shipment.quantityMt.toFixed(3),
    transportMode: shipment.transportMode,
    origin: shipment.origin,
    destination: shipment.destination,
    plannedDepartureDate: formatDateOnly(shipment.plannedDepartureDate),
    plannedArrivalDate: formatDateOnly(shipment.plannedArrivalDate),
    actualDepartureDate: shipment.actualDepartureDate ? formatDateOnly(shipment.actualDepartureDate) : null,
    actualArrivalDate: shipment.actualArrivalDate ? formatDateOnly(shipment.actualArrivalDate) : null,
    status: shipment.status,
    trade: {
      id: shipment.trade.id,
      direction: shipment.trade.direction,
      status: shipment.trade.status,
    },
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const shipmentInclude = { warehouse: true, trade: { include: { commodity: true } } } as const;

export interface ListShipmentsFilters {
  status?: ShipmentStatus;
  tradeId?: string;
  warehouseId?: string;
}

export function listShipments(filters: ListShipmentsFilters) {
  return prisma.shipment.findMany({
    where: { status: filters.status, tradeId: filters.tradeId, warehouseId: filters.warehouseId },
    include: shipmentInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function getShipmentById(id: string) {
  return prisma.shipment.findUnique({ where: { id }, include: shipmentInclude });
}

export function listShipmentsForTrade(tradeId: string) {
  return prisma.shipment.findMany({
    where: { tradeId },
    include: shipmentInclude,
    orderBy: { createdAt: "desc" },
  });
}

// Shipments currently PLANNED or IN_TRANSIT, across all trades — backs
// the dashboard's shipments-in-progress widget (spec §7).
export function listShipmentsInProgress() {
  return prisma.shipment.findMany({
    where: { status: { in: ["PLANNED", "IN_TRANSIT"] } },
    include: shipmentInclude,
    orderBy: { plannedDepartureDate: "asc" },
  });
}

class TradeMissingInTransaction extends Error {
  constructor(readonly tradeId: string) {
    super("trade not found");
  }
}

class TradeNotConfirmedInTransaction extends Error {
  constructor(readonly status: string) {
    super("trade not confirmed");
  }
}

class ExceedsTradeQuantity extends Error {
  constructor(
    readonly wouldBeSum: Prisma.Decimal,
    readonly tradeQuantityMt: Prisma.Decimal,
  ) {
    super("shipment quantities would exceed trade quantity");
  }
}

// A shipment PLANNED->IN_TRANSIT or IN_TRANSIT->DELIVERED transition lost
// the compare-and-swap race in departShipment/deliverShipment below (a
// concurrent request already moved this exact shipment on).
class AlreadyTransitioned extends Error {
  constructor() {
    super("shipment already transitioned");
  }
}

interface AssertWithinTradeQuantityInput {
  tradeId: string;
  tradeQuantityMt: Prisma.Decimal;
  newQuantityMt: Prisma.Decimal;
  excludeShipmentId?: string;
}

// BR-4a: shared by createShipment and patchShipment's quantityMt
// re-check. Callers must already hold the trade row lock (SELECT ... FOR
// UPDATE, in the same transaction) before calling this — no DB constraint
// covers a cross-row sum like "this trade's shipment quantities", so the
// trade row itself is the serialization point (product owner decision):
// without the lock, two concurrent creates/edits could each read the same
// "sum so far", each individually fit under the trade quantity, and
// together exceed it.
async function assertWithinTradeQuantity(tx: Prisma.TransactionClient, input: AssertWithinTradeQuantityInput) {
  const others = await tx.shipment.findMany({
    where: {
      tradeId: input.tradeId,
      id: input.excludeShipmentId ? { not: input.excludeShipmentId } : undefined,
    },
    select: { quantityMt: true },
  });
  const sumOfOthers = others.reduce((total, s) => total.plus(s.quantityMt), new Prisma.Decimal(0));
  const projected = sumOfOthers.plus(input.newQuantityMt);
  if (projected.gt(input.tradeQuantityMt)) {
    throw new ExceedsTradeQuantity(projected, input.tradeQuantityMt);
  }
}

function exceedsTradeQuantityError(err: ExceedsTradeQuantity): Err {
  return fieldError(
    "quantityMt",
    `shipment quantities would total ${err.wouldBeSum.toFixed(3)} MT, exceeding the trade's ${err.tradeQuantityMt.toFixed(3)} MT`,
  );
}

export interface CreateShipmentInput {
  tradeId: string;
  warehouseId: string;
  quantityMt: string;
  transportMode: TransportMode;
  origin: string;
  destination: string;
  plannedDepartureDate: Date;
  plannedArrivalDate: Date;
}

export async function createShipment(input: CreateShipmentInput): Promise<Result<ShipmentWithRelations>> {
  try {
    const shipment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trade" WHERE id = ${input.tradeId} FOR UPDATE`;
      const trade = await tx.trade.findUnique({ where: { id: input.tradeId } });
      if (!trade) throw new TradeMissingInTransaction(input.tradeId);
      if (trade.status !== "CONFIRMED") throw new TradeNotConfirmedInTransaction(trade.status);

      await assertWithinTradeQuantity(tx, {
        tradeId: input.tradeId,
        tradeQuantityMt: trade.quantityMt,
        newQuantityMt: new Prisma.Decimal(input.quantityMt),
      });

      return tx.shipment.create({
        data: {
          tradeId: input.tradeId,
          warehouseId: input.warehouseId,
          quantityMt: input.quantityMt,
          transportMode: input.transportMode,
          origin: input.origin,
          destination: input.destination,
          plannedDepartureDate: input.plannedDepartureDate,
          plannedArrivalDate: input.plannedArrivalDate,
          status: "PLANNED",
        },
        include: shipmentInclude,
      });
    });
    return { ok: true, data: shipment };
  } catch (err) {
    if (err instanceof TradeMissingInTransaction) return notFound(`Trade ${err.tradeId} not found`);
    if (err instanceof TradeNotConfirmedInTransaction) return tradeNotConfirmed(err.status);
    if (err instanceof ExceedsTradeQuantity) return exceedsTradeQuantityError(err);
    throw err;
  }
}

export interface PatchShipmentInput {
  warehouseId?: string;
  quantityMt?: string;
  transportMode?: TransportMode;
  origin?: string;
  destination?: string;
  plannedDepartureDate?: Date;
  plannedArrivalDate?: Date;
}

export async function patchShipment(id: string, input: PatchShipmentInput): Promise<Result<ShipmentWithRelations>> {
  const shipment = await prisma.shipment.findUnique({ where: { id }, include: { trade: true } });
  if (!shipment) return notFound(`Shipment ${id} not found`);
  if (shipment.status !== "PLANNED") return notEditable(shipment.status);

  const mergedDeparture = input.plannedDepartureDate ?? shipment.plannedDepartureDate;
  const mergedArrival = input.plannedArrivalDate ?? shipment.plannedArrivalDate;
  if (mergedArrival.getTime() < mergedDeparture.getTime()) {
    // Blame whichever field the client actually submitted, same approach
    // as trades/service.ts's patchTrade.
    const conflictField = input.plannedArrivalDate !== undefined ? "plannedArrivalDate" : "plannedDepartureDate";
    return fieldError(conflictField, "plannedArrivalDate must be on or after plannedDepartureDate");
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (input.quantityMt !== undefined) {
        await tx.$queryRaw`SELECT id FROM "Trade" WHERE id = ${shipment.tradeId} FOR UPDATE`;
        await assertWithinTradeQuantity(tx, {
          tradeId: shipment.tradeId,
          tradeQuantityMt: shipment.trade.quantityMt,
          newQuantityMt: new Prisma.Decimal(input.quantityMt),
          excludeShipmentId: id,
        });
      }

      return tx.shipment.update({
        where: { id },
        data: {
          warehouseId: input.warehouseId,
          quantityMt: input.quantityMt,
          transportMode: input.transportMode,
          origin: input.origin,
          destination: input.destination,
          plannedDepartureDate: input.plannedDepartureDate,
          plannedArrivalDate: input.plannedArrivalDate,
        },
        include: shipmentInclude,
      });
    });
    return { ok: true, data: updated };
  } catch (err) {
    if (err instanceof ExceedsTradeQuantity) return exceedsTradeQuantityError(err);
    throw err;
  }
}

export async function deleteShipment(id: string): Promise<Result<{ id: string }>> {
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) return notFound(`Shipment ${id} not found`);
  if (shipment.status !== "PLANNED") return notDeletable(shipment.status);

  await prisma.shipment.delete({ where: { id } });
  return { ok: true, data: { id } };
}

// Shared by departShipment/deliverShipment: retries once on the same
// "concurrent first movement for a warehouse+commodity pair" race
// recordMovement itself retries (see inventory/service.ts), and maps
// every other failure mode (lost the compare-and-swap race, insufficient
// stock, a duplicate movement, or the DB CHECK backstop) to the matching
// HTTP Result.
async function runTransition<T>(
  currentStatusFallback: string,
  toStatus: string,
  warehouseId: string,
  commodityId: string,
  quantityMt: Prisma.Decimal,
  shipmentId: string,
  attempt: () => Promise<T>,
): Promise<Result<T>> {
  try {
    let updated: T;
    try {
      updated = await attempt();
    } catch (err) {
      if (isUniqueConflict(err, ["warehouseId", "commodityId"])) {
        updated = await attempt();
      } else {
        throw err;
      }
    }
    return { ok: true, data: updated };
  } catch (err) {
    if (err instanceof AlreadyTransitioned) {
      const current = await prisma.shipment.findUnique({ where: { id: shipmentId } });
      return invalidTransition(current?.status ?? currentStatusFallback, toStatus);
    }
    if (err instanceof InsufficientStockInTransaction) {
      return insufficientStock(err.available, err.requested);
    }
    if (isUniqueConflict(err, ["shipmentId"])) {
      return duplicateMovement(shipmentId);
    }
    if (isBalanceCheckViolation(err)) {
      const current = await prisma.inventoryBalance.findUnique({ where: balanceKey(warehouseId, commodityId) });
      return insufficientStock(current?.quantityMt ?? new Prisma.Decimal(0), quantityMt);
    }
    throw err;
  }
}

export interface DepartShipmentInput {
  actualDepartureDate: Date;
}

// PLANNED -> IN_TRANSIT. For a SELL trade, decrements the origin
// warehouse's stock (BR-3), atomically with the status change, inside the
// same transaction — via recordMovementInTransaction, never inlined (per
// CLAUDE.md). The status flip is a compare-and-swap
// (`updateMany(... WHERE status = 'PLANNED')`) rather than a plain
// update: under two concurrent depart calls for the same shipment,
// Postgres serializes the two UPDATE statements on the shipment row, so
// only the first can ever see status = 'PLANNED' — the second's
// compare-and-swap matches zero rows once it's unblocked, and is rejected
// with a clean 409 rather than double-transitioning or double-recording a
// movement.
export async function departShipment(id: string, input: DepartShipmentInput): Promise<Result<ShipmentWithRelations>> {
  const shipment = await prisma.shipment.findUnique({ where: { id }, include: { trade: true } });
  if (!shipment) return notFound(`Shipment ${id} not found`);
  if (shipment.trade.status !== "CONFIRMED") return tradeNotConfirmed(shipment.trade.status);
  if (shipment.status !== "PLANNED") return invalidTransition(shipment.status, "IN_TRANSIT");

  async function attempt() {
    return prisma.$transaction(async (tx) => {
      const cas = await tx.shipment.updateMany({
        where: { id, status: "PLANNED" },
        data: { status: "IN_TRANSIT", actualDepartureDate: input.actualDepartureDate },
      });
      if (cas.count === 0) throw new AlreadyTransitioned();

      if (shipment!.trade.direction === "SELL") {
        await recordMovementInTransaction(tx, {
          warehouseId: shipment!.warehouseId,
          commodityId: shipment!.trade.commodityId,
          shipmentId: id,
          quantityMt: shipment!.quantityMt.negated(),
        });
      }

      return tx.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
    });
  }

  return runTransition(
    shipment.status,
    "IN_TRANSIT",
    shipment.warehouseId,
    shipment.trade.commodityId,
    shipment.quantityMt,
    id,
    attempt,
  );
}

export interface DeliverShipmentInput {
  actualArrivalDate: Date;
}

// IN_TRANSIT -> DELIVERED. For a BUY trade, increments the destination
// warehouse's stock (BR-2), atomically with the status change — same
// compare-and-swap treatment as departShipment above, for the same
// concurrent-double-deliver reason.
export async function deliverShipment(id: string, input: DeliverShipmentInput): Promise<Result<ShipmentWithRelations>> {
  const shipment = await prisma.shipment.findUnique({ where: { id }, include: { trade: true } });
  if (!shipment) return notFound(`Shipment ${id} not found`);
  if (shipment.status !== "IN_TRANSIT") return invalidTransition(shipment.status, "DELIVERED");
  if (shipment.actualDepartureDate && input.actualArrivalDate.getTime() < shipment.actualDepartureDate.getTime()) {
    return fieldError("actualArrivalDate", "actualArrivalDate must be on or after actualDepartureDate");
  }

  async function attempt() {
    return prisma.$transaction(async (tx) => {
      const cas = await tx.shipment.updateMany({
        where: { id, status: "IN_TRANSIT" },
        data: { status: "DELIVERED", actualArrivalDate: input.actualArrivalDate },
      });
      if (cas.count === 0) throw new AlreadyTransitioned();

      if (shipment!.trade.direction === "BUY") {
        await recordMovementInTransaction(tx, {
          warehouseId: shipment!.warehouseId,
          commodityId: shipment!.trade.commodityId,
          shipmentId: id,
          quantityMt: shipment!.quantityMt,
        });
      }

      return tx.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
    });
  }

  return runTransition(
    shipment.status,
    "DELIVERED",
    shipment.warehouseId,
    shipment.trade.commodityId,
    shipment.quantityMt,
    id,
    attempt,
  );
}

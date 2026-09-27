// Shapes returned by the backend API (see backend/src/modules/*/service.ts
// for the serializers these mirror). `quantityMt` and `price` are always
// decimal strings on the wire (BR-1, spec.md §6) — typed as `string`
// here, never `number`, so nothing in the frontend is tempted to run
// arithmetic on them as JS floats.

export interface HealthResponse {
  status: "ok" | "error";
  db: "connected" | "disconnected";
}

export type CommodityCategory = "GRAIN" | "COFFEE" | "SUGAR";
export type Unit = "MT";

export interface Commodity {
  id: string;
  name: string;
  category: CommodityCategory;
  unit: Unit;
  createdAt: string;
  updatedAt: string;
}

export type CounterpartyType = "BUYER" | "SELLER" | "BOTH";

export interface Counterparty {
  id: string;
  name: string;
  type: CounterpartyType;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export type TradeDirection = "BUY" | "SELL";
export type Currency = "USD" | "EUR" | "GBP";
export type TradeStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export interface Trade {
  id: string;
  commodityId: string;
  direction: TradeDirection;
  counterpartyId: string;
  quantityMt: string;
  price: string;
  currency: Currency;
  // "YYYY-MM-DD", never a full timestamp (BR-6).
  deliveryPeriodStart: string;
  deliveryPeriodEnd: string;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
}

// GET /api/trades/:id nests the trade's shipments and adds
// remainingQuantityMt (trade.quantityMt minus every shipment's
// quantityMt, computed backend-side — BR-1, Phase 7); GET /api/trades
// (list) has neither — see trades/routes.ts.
export interface TradeWithShipments extends Trade {
  shipments: Shipment[];
  remainingQuantityMt: string;
}

export type TransportMode = "TRUCK" | "RAIL" | "VESSEL";
export type ShipmentStatus = "PLANNED" | "IN_TRANSIT" | "DELIVERED";

// A summary of the parent trade, nested on every shipment. Duplicates
// (a slice of) the trade object a shipment is already nested under when
// read via GET /api/trades/:id — a known wart, deliberately left as-is;
// see plan.md's Phase 3b implementation notes.
export interface ShipmentTradeSummary {
  id: string;
  direction: TradeDirection;
  status: TradeStatus;
}

export interface Shipment {
  id: string;
  tradeId: string;
  // BR-8: read from the parent trade, never a stored column of its own.
  commodityId: string;
  commodityName: string;
  warehouseId: string;
  warehouseName: string;
  quantityMt: string;
  transportMode: TransportMode;
  origin: string;
  destination: string;
  plannedDepartureDate: string;
  plannedArrivalDate: string;
  actualDepartureDate: string | null;
  actualArrivalDate: string | null;
  status: ShipmentStatus;
  trade: ShipmentTradeSummary;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBalance {
  warehouseId: string;
  warehouseName: string;
  commodityId: string;
  commodityName: string;
  quantityMt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  warehouseId: string;
  warehouseName: string;
  commodityId: string;
  commodityName: string;
  shipmentId: string;
  quantityMt: string;
  createdAt: string;
}

export interface DashboardPosition {
  commodityId: string;
  commodityName: string;
  netPositionMt: string;
}

// Every non-2xx response body is one of these shapes (see the `notFound`/
// `invalidTransition`/`fieldError`/etc. helpers across the backend's
// modules/*/service.ts files). `message` is absent on a validation_failed
// body (it carries `fields` instead); `shipmentIds` is present only on
// BR-10's shipments_exist rejection.
export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  fields?: FieldError[];
  shipmentIds?: string[];
}

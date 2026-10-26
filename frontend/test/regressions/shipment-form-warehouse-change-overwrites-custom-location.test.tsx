// Regression test for: editing a PLANNED shipment whose destination (BUY)
// or origin (SELL) already differs from its warehouse's name, then changing
// the Warehouse dropdown without touching Destination/Origin, overwrote that
// free-text value with the newly selected warehouse's name. Per spec §3 and
// plan.md Phase 7, the auto-fill must stop as soon as the field holds a
// value the user entered — in edit mode, the shipment's existing stored
// value counts as user-entered, even though this form instance hasn't
// "touched" it itself yet.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../../src/api/types";
import { ShipmentForm } from "../../src/components/ShipmentForm";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function mockWarehouses(warehouses: unknown[] = []) {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/warehouses") return jsonResponse(200, warehouses);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const warehouseList = [
  { id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" },
  { id: "w2", name: "Antwerp Terminal", location: "Antwerp", createdAt: "", updatedAt: "" },
];

const buyShipment: Shipment = {
  id: "s1",
  tradeId: "t1",
  commodityId: "c1",
  commodityName: "Wheat",
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  quantityMt: "100.100",
  transportMode: "VESSEL",
  origin: "Felixstowe Port",
  destination: "Customer Dock 4",
  plannedDepartureDate: "2026-01-20",
  plannedArrivalDate: "2026-01-25",
  actualDepartureDate: null,
  actualArrivalDate: null,
  status: "PLANNED",
  trade: { id: "t1", direction: "BUY", status: "CONFIRMED" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sellShipment: Shipment = {
  ...buyShipment,
  id: "s2",
  tradeId: "t2",
  origin: "Supplier Yard 7",
  destination: "Rotterdam Silo",
  trade: { id: "t2", direction: "SELL", status: "CONFIRMED" },
};

describe("ShipmentForm regression: warehouse change must not overwrite a pre-existing custom destination/origin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not overwrite an existing custom destination on a BUY shipment when the warehouse changes", async () => {
    mockWarehouses(warehouseList);
    render(
      <ShipmentForm tradeDirection="BUY" initial={buyShipment} onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />,
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "Antwerp Terminal" })).toBeInTheDocument());

    expect(screen.getByLabelText("Destination")).toHaveValue("Customer Dock 4");

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w2" } });

    expect(screen.getByLabelText("Destination")).toHaveValue("Customer Dock 4");
  });

  it("does not overwrite an existing custom origin on a SELL shipment when the warehouse changes", async () => {
    mockWarehouses(warehouseList);
    render(
      <ShipmentForm tradeDirection="SELL" initial={sellShipment} onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />,
    );
    await waitFor(() => expect(screen.getByRole("option", { name: "Antwerp Terminal" })).toBeInTheDocument());

    expect(screen.getByLabelText("Origin")).toHaveValue("Supplier Yard 7");

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w2" } });

    expect(screen.getByLabelText("Origin")).toHaveValue("Supplier Yard 7");
  });
});

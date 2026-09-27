import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "../src/api/types";
import { ShipmentForm } from "../src/components/ShipmentForm";

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

const baseShipment: Shipment = {
  id: "s1",
  tradeId: "t1",
  commodityId: "c1",
  commodityName: "Wheat",
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  quantityMt: "100.100",
  transportMode: "VESSEL",
  origin: "Rotterdam",
  destination: "Antwerp",
  plannedDepartureDate: "2026-01-20",
  plannedArrivalDate: "2026-01-25",
  actualDepartureDate: null,
  actualArrivalDate: null,
  status: "PLANNED",
  trade: { id: "t1", direction: "BUY", status: "CONFIRMED" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ShipmentForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an inline required message and does not submit when a required field is empty", () => {
    mockWarehouses();
    const onSubmit = vi.fn();
    render(<ShipmentForm tradeDirection="BUY" onSubmit={onSubmit} submitting={false} fieldErrors={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByText("This field is required").length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends quantityMt exactly as typed, using a value a number conversion would change", async () => {
    mockWarehouses(warehouseList);
    const onSubmit = vi.fn();
    render(<ShipmentForm tradeDirection="BUY" onSubmit={onSubmit} submitting={false} fieldErrors={[]} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "100.100" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Origin Port" } });
    fireEvent.change(screen.getByLabelText("Planned departure date"), { target: { value: "2026-01-20" } });
    fireEvent.change(screen.getByLabelText("Planned arrival date"), { target: { value: "2026-01-25" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityMt: "100.100",
        plannedDepartureDate: "2026-01-20",
        plannedArrivalDate: "2026-01-25",
      }),
    );
  });

  it("shows an existing PLANNED shipment's quantityMt unmodified in the edit form", () => {
    mockWarehouses(warehouseList);
    render(
      <ShipmentForm tradeDirection="BUY" initial={baseShipment} onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />,
    );

    expect(screen.getByLabelText("Quantity (MT)")).toHaveValue("100.100");
    expect(screen.getByLabelText("Planned departure date")).toHaveValue("2026-01-20");
    expect(screen.getByLabelText("Planned arrival date")).toHaveValue("2026-01-25");
  });

  it("renders a field error next to the quantity field", () => {
    mockWarehouses(warehouseList);
    render(
      <ShipmentForm
        tradeDirection="BUY"
        initial={baseShipment}
        onSubmit={vi.fn()}
        submitting={false}
        fieldErrors={[{ field: "quantityMt", message: "shipment quantities would total 400.000 MT, exceeding the trade's 300.000 MT" }]}
      />,
    );

    expect(screen.getByLabelText("Quantity (MT)").closest("div")).toHaveTextContent(
      "shipment quantities would total 400.000 MT",
    );
  });

  it("populates the warehouse dropdown from the reference-data API response", async () => {
    mockWarehouses(warehouseList);
    render(<ShipmentForm tradeDirection="BUY" onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Antwerp Terminal" })).toBeInTheDocument();
    });
  });

  it("auto-fills destination with the selected warehouse's name for a BUY trade's shipment", async () => {
    mockWarehouses(warehouseList);
    render(<ShipmentForm tradeDirection="BUY" onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    expect(screen.getByLabelText("Destination")).toHaveValue("Rotterdam Silo");

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w2" } });
    expect(screen.getByLabelText("Destination")).toHaveValue("Antwerp Terminal");
  });

  it("auto-fills origin with the selected warehouse's name for a SELL trade's shipment", async () => {
    mockWarehouses(warehouseList);
    render(<ShipmentForm tradeDirection="SELL" onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    expect(screen.getByLabelText("Origin")).toHaveValue("Rotterdam Silo");
  });

  it("stops auto-filling destination once the user has typed into it themselves", async () => {
    mockWarehouses(warehouseList);
    render(<ShipmentForm tradeDirection="BUY" onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    expect(screen.getByLabelText("Destination")).toHaveValue("Rotterdam Silo");

    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "A custom port" } });
    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w2" } });

    expect(screen.getByLabelText("Destination")).toHaveValue("A custom port");
  });

  it("disables the Save button while submitting and ignores a click", () => {
    mockWarehouses();
    const onSubmit = vi.fn();
    render(
      <ShipmentForm tradeDirection="BUY" initial={baseShipment} onSubmit={onSubmit} submitting={true} fieldErrors={[]} />,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

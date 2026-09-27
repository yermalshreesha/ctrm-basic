import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment, TradeWithShipments } from "../src/api/types";
import { ShipmentDetail } from "../src/pages/ShipmentDetail";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function buildTradeContext(overrides: Partial<TradeWithShipments> = {}): TradeWithShipments {
  return {
    id: "t1",
    commodityId: "c1",
    direction: "BUY",
    counterpartyId: "cp1",
    quantityMt: "300.000",
    price: "1200.50",
    currency: "USD",
    deliveryPeriodStart: "2026-01-15",
    deliveryPeriodEnd: "2026-02-20",
    status: "CONFIRMED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    shipments: [],
    remainingQuantityMt: "300.000",
    ...overrides,
  };
}

function buildShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
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
    ...overrides,
  };
}

function renderDetail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/logistics/new" element={<ShipmentDetail />} />
        <Route path="/logistics/:id" element={<ShipmentDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForShipmentLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading shipment...")).not.toBeInTheDocument());
}

async function waitForTradeLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading trade...")).not.toBeInTheDocument());
}

describe("ShipmentDetail — create mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a clear message and no form when /logistics/new has no tradeId", () => {
    renderDetail("/logistics/new");
    expect(screen.getByText("A trade must be specified to create a shipment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows a clear message and no form for an unknown tradeId", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/trades/unknown") return jsonResponse(404, { error: "not_found", message: "Trade unknown not found" });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=unknown");
    await waitForTradeLoaded();

    expect(screen.getByText("Trade not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows a clear message when the trade fetch fails entirely (network error)", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("Network error")));
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();

    expect(screen.getByText("Failed to load trade.")).toBeInTheDocument();
  });

  it("shows the trade's commodity, direction and remainingQuantityMt as read-only context", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/trades/t1") return jsonResponse(200, buildTradeContext({ remainingQuantityMt: "199.700" }));
      if (url === "/api/commodities") return jsonResponse(200, [{ id: "c1", name: "Wheat", category: "GRAIN", unit: "MT", createdAt: "", updatedAt: "" }]);
      if (url === "/api/warehouses") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();

    expect(screen.getByText(/Trade: BUY Wheat/)).toBeInTheDocument();
    expect(screen.getByText(/remaining to ship: 199.700 MT/)).toBeInTheDocument();
  });

  it("creates a shipment with the tradeId from the query string and navigates to its detail page", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTradeContext());
      if (url === "/api/commodities") return jsonResponse(200, []);
      if (url === "/api/warehouses") return jsonResponse(200, [{ id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" }]);
      if (url === "/api/shipments" && method === "POST") {
        return jsonResponse(201, buildShipment({ id: "new-s" }));
      }
      if (url === "/api/shipments/new-s" && method === "GET") {
        return jsonResponse(200, buildShipment({ id: "new-s" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "50.000" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Origin Port" } });
    fireEvent.change(screen.getByLabelText("Planned departure date"), { target: { value: "2026-01-20" } });
    fireEvent.change(screen.getByLabelText("Planned arrival date"), { target: { value: "2026-01-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shipment" })).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/shipments/new-s")).toBe(true);

    const createCall = fetchMock.mock.calls.find(([u, i]) => u === "/api/shipments" && (i as RequestInit)?.method === "POST");
    expect(createCall).toBeDefined();
    const createBody = JSON.parse((createCall![1] as RequestInit).body as string);
    expect(createBody.tradeId).toBe("t1");
  });

  it("shows a 400 field error next to the right field without navigating", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTradeContext());
      if (url === "/api/commodities") return jsonResponse(200, []);
      if (url === "/api/warehouses") return jsonResponse(200, [{ id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" }]);
      if (url === "/api/shipments" && method === "POST") {
        return jsonResponse(400, {
          error: "validation_failed",
          fields: [{ field: "quantityMt", message: "shipment quantities would total 400.000 MT, exceeding the trade's 300.000 MT" }],
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "400.000" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Origin Port" } });
    fireEvent.change(screen.getByLabelText("Planned departure date"), { target: { value: "2026-01-20" } });
    fireEvent.change(screen.getByLabelText("Planned arrival date"), { target: { value: "2026-01-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Quantity (MT)").closest("div")).toHaveTextContent("exceeding the trade's 300.000 MT"),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows a non-field 409 in a dismissible banner", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTradeContext());
      if (url === "/api/commodities") return jsonResponse(200, []);
      if (url === "/api/warehouses") return jsonResponse(200, [{ id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" }]);
      if (url === "/api/shipments" && method === "POST") {
        return jsonResponse(409, { error: "trade_not_confirmed", message: "Trade status is DRAFT, not CONFIRMED" });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });
    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "50.000" } });
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "Origin Port" } });
    fireEvent.change(screen.getByLabelText("Planned departure date"), { target: { value: "2026-01-20" } });
    fireEvent.change(screen.getByLabelText("Planned arrival date"), { target: { value: "2026-01-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Trade status is DRAFT, not CONFIRMED"));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a clear message instead of the form when the trade exists but is not CONFIRMED", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/trades/t1") return jsonResponse(200, buildTradeContext({ status: "DRAFT" }));
      if (url === "/api/commodities" || url === "/api/warehouses") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/new?tradeId=t1");
    await waitForTradeLoaded();

    expect(
      screen.getByText("Trade status is DRAFT, not CONFIRMED — a shipment can only be added to a CONFIRMED trade."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("ShipmentDetail — existing shipment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockLoad(shipment: Shipment, tradeContext: TradeWithShipments = buildTradeContext()) {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === `/api/shipments/${shipment.id}` && method === "GET") return jsonResponse(200, shipment);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, tradeContext);
      if (url === "/api/commodities") return jsonResponse(200, []);
      if (url === "/api/warehouses") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shows 'Shipment not found' for an unknown shipment id (404)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/shipments/unknown") return jsonResponse(404, { error: "not_found", message: "Shipment unknown not found" });
      if (url === "/api/commodities") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/unknown");
    await waitFor(() => expect(screen.getByText("Shipment not found")).toBeInTheDocument());
  });

  it("shows a clear message when the shipment fetch fails entirely (network error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, []);
      return Promise.reject(new Error("Network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("/logistics/s1");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
  });

  it("shows Depart and Delete (not Deliver) for a PLANNED shipment, with an editable form", async () => {
    mockLoad(buildShipment({ status: "PLANNED" }));
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    expect(screen.getByRole("button", { name: "Depart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deliver" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantity (MT)")).toBeInTheDocument();
  });

  it("shows Deliver (not Depart/Delete) for an IN_TRANSIT shipment, read-only", async () => {
    mockLoad(buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    expect(screen.getByRole("button", { name: "Deliver" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Depart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity (MT)")).not.toBeInTheDocument();
    expect(screen.getByText("100.100")).toBeInTheDocument();
  });

  it("shows no action buttons for a DELIVERED shipment, fully read-only", async () => {
    mockLoad(
      buildShipment({ status: "DELIVERED", actualDepartureDate: "2026-01-20", actualArrivalDate: "2026-01-26" }),
    );
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    expect(screen.queryByRole("button", { name: "Depart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deliver" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before Depart; declining sends no request, confirming sends actualDepartureDate as typed", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Depart" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => (u as string).includes("/depart"))).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Actual departure date (optional, defaults to today)"), {
      target: { value: "2026-01-18" },
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(200, buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-18" }));
      }
      if (url === "/api/trades/t1") return jsonResponse(200, buildTradeContext());
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Deliver" })).toBeInTheDocument());

    const departCall = fetchMock.mock.calls.find(([u]) => u === "/api/shipments/s1/depart");
    expect(departCall).toBeDefined();
    const departBody = JSON.parse((departCall![1] as RequestInit).body as string);
    expect(departBody).toEqual({ actualDepartureDate: "2026-01-18" });
  });

  it("omits actualDepartureDate from the request body when the optional date is left blank", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(200, buildShipment({ status: "IN_TRANSIT" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Deliver" })).toBeInTheDocument());

    const departCall = fetchMock.mock.calls.find(([u]) => u === "/api/shipments/s1/depart");
    expect(departCall).toBeDefined();
    expect((departCall![1] as RequestInit).body).toBeUndefined();
  });

  it("shows an insufficient-stock 409 from Depart as a field-level error next to the quantity field", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED", trade: { id: "t1", direction: "SELL", status: "CONFIRMED" } }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(409, {
          error: "insufficient_stock",
          message: "insufficient stock: available 10.000 MT, requested 100.100 MT",
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent("insufficient stock");
    });
    expect(screen.getByLabelText("Quantity (MT)").closest("div")).toHaveTextContent("insufficient stock");
  });

  it("shows a non-quantity 409 (invalid_transition) from Depart as a dismissible banner", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(409, { error: "invalid_transition", message: "Cannot transition shipment from IN_TRANSIT to IN_TRANSIT" });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot transition shipment"));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for confirmation before Deliver; declining sends no request, confirming sends actualArrivalDate as typed", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => (u as string).includes("/deliver"))).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.change(screen.getByLabelText("Actual arrival date (optional, defaults to today)"), {
      target: { value: "2026-01-26" },
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/deliver" && method === "POST") {
        return jsonResponse(
          200,
          buildShipment({ status: "DELIVERED", actualDepartureDate: "2026-01-20", actualArrivalDate: "2026-01-26" }),
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Deliver" })).not.toBeInTheDocument());

    const deliverCall = fetchMock.mock.calls.find(([u]) => u === "/api/shipments/s1/deliver");
    expect(deliverCall).toBeDefined();
    const deliverBody = JSON.parse((deliverCall![1] as RequestInit).body as string);
    expect(deliverBody).toEqual({ actualArrivalDate: "2026-01-26" });
  });

  it("omits actualArrivalDate from the request body when the optional date is left blank", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/deliver" && method === "POST") {
        return jsonResponse(
          200,
          buildShipment({ status: "DELIVERED", actualDepartureDate: "2026-01-20", actualArrivalDate: "2026-01-21" }),
        );
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Deliver" })).not.toBeInTheDocument());

    const deliverCall = fetchMock.mock.calls.find(([u]) => u === "/api/shipments/s1/deliver");
    expect(deliverCall).toBeDefined();
    expect((deliverCall![1] as RequestInit).body).toBeUndefined();
  });

  it("shows a 409 from Deliver as a dismissible banner", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/deliver" && method === "POST") {
        return jsonResponse(409, { error: "invalid_transition", message: "Cannot transition shipment from PLANNED to DELIVERED" });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot transition shipment"));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Deliver while a request is running", async () => {
    let resolveDeliver: (value: unknown) => void = () => {};
    const fetchMock = mockLoad(buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/deliver" && method === "POST") {
        return new Promise((resolve) => {
          resolveDeliver = () => resolve(jsonResponse(200, buildShipment({ status: "DELIVERED" })));
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Deliver" })).toBeDisabled());

    resolveDeliver(undefined);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deliver" })).not.toBeInTheDocument());
  });

  it("asks for confirmation before Delete; confirming deletes and navigates to /logistics", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/logistics/s1"]}>
        <Routes>
          <Route path="/logistics" element={<p>Logistics list</p>} />
          <Route path="/logistics/:id" element={<ShipmentDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1" && method === "DELETE") return jsonResponse(204, null);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("Logistics list")).toBeInTheDocument());
  });

  it("disables Depart, Delete and the form's Save button while any one request is running", async () => {
    let resolveDepart: (value: unknown) => void = () => {};
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return new Promise((resolve) => {
          resolveDepart = () => resolve(jsonResponse(200, buildShipment({ status: "IN_TRANSIT" })));
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Depart" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    resolveDepart(undefined);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Depart" })).not.toBeInTheDocument());
  });

  it("updates from Depart/Deliver's own response, without an extra GET /api/shipments/:id", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();

    fetchMock.mockClear();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(200, buildShipment({ status: "IN_TRANSIT", actualDepartureDate: "2026-01-20" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Depart" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Deliver" })).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/shipments/s1")).toBe(false);
  });

  it("updates from Save's PATCH response and re-fetches the trade's remainingQuantityMt afterward", async () => {
    const fetchMock = mockLoad(buildShipment({ status: "PLANNED", quantityMt: "100.100" }));
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();
    await waitFor(() => expect(screen.getByText(/Remaining to ship for this trade: 300.000 MT/)).toBeInTheDocument());

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1" && method === "PATCH") {
        return jsonResponse(200, buildShipment({ status: "PLANNED", quantityMt: "150.500" }));
      }
      if (url === "/api/trades/t1" && method === "GET") {
        return jsonResponse(200, buildTradeContext({ remainingQuantityMt: "149.500" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "150.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Quantity (MT)")).toHaveValue("150.500"));
    await waitFor(() => expect(screen.getByText(/Remaining to ship for this trade: 149.500 MT/)).toBeInTheDocument());
  });

  it("resets errors and field errors when the shipment id changes", async () => {
    const shipmentS1 = buildShipment({ id: "s1", status: "PLANNED" });
    const shipmentS2 = buildShipment({ id: "s2", status: "PLANNED" });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/shipments/s1" && method === "GET") return jsonResponse(200, shipmentS1);
      if (url === "/api/shipments/s2" && method === "GET") return jsonResponse(200, shipmentS2);
      if (url === "/api/trades/t1") return jsonResponse(200, buildTradeContext());
      if (url === "/api/commodities" || url === "/api/warehouses") return jsonResponse(200, []);
      if (url === "/api/shipments/s1/depart" && method === "POST") {
        return jsonResponse(409, { error: "invalid_transition", message: "Cannot transition shipment from PLANNED to PLANNED" });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/logistics/s1"]}>
        <Routes>
          <Route
            path="/logistics/:id"
            element={
              <>
                <Link to="/logistics/s2">Go to s2</Link>
                <ShipmentDetail />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitForShipmentLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Depart" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot transition shipment"));

    fireEvent.click(screen.getByRole("link", { name: "Go to s2" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("displays quantityMt exactly as returned by the API, in both the editable form and the read-only view", async () => {
    mockLoad(buildShipment({ status: "PLANNED", quantityMt: "1200.500" }));
    const { unmount } = renderDetail("/logistics/s1");
    await waitForShipmentLoaded();
    expect(screen.getByLabelText("Quantity (MT)")).toHaveValue("1200.500");
    unmount();

    mockLoad(buildShipment({ status: "DELIVERED", quantityMt: "1200.500", actualDepartureDate: "2026-01-20", actualArrivalDate: "2026-01-26" }));
    renderDetail("/logistics/s1");
    await waitForShipmentLoaded();
    expect(screen.getByText("1200.500")).toBeInTheDocument();
  });
});

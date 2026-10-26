import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logistics } from "../src/pages/Logistics";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderLogistics(initialEntry = "/logistics") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationDisplay />
      <Routes>
        <Route path="/logistics" element={<Logistics />} />
        <Route path="/logistics/:id" element={<div>Shipment detail page</div>} />
        <Route path="/trades/:id" element={<div>Trade detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const warehouses = [{ id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" }];

const shipment = {
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

describe("Logistics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one row per shipment returned by the API, in the order the API returns them", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment, { ...shipment, id: "s2" }]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();

    // Header row + 2 shipment rows, in API order (no client re-sorting).
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  });

  it("shows all of the spec's columns for a shipment row", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const table = within(screen.getByRole("table"));

    expect(table.getByText("Wheat")).toBeInTheDocument();
    expect(table.getByText("Rotterdam Silo")).toBeInTheDocument();
    expect(table.getByText("VESSEL")).toBeInTheDocument();
    expect(table.getByText("Rotterdam")).toBeInTheDocument();
    expect(table.getByText("Antwerp")).toBeInTheDocument();
    expect(table.getByText("2026-01-20 – 2026-01-25")).toBeInTheDocument();
    expect(table.getByText("— – —")).toBeInTheDocument();
    expect(table.getByText("PLANNED")).toBeInTheDocument();
  });

  it("links each row to its shipment detail page and to its parent trade, via clear link text", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();
    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());

    // The Trade/Commodity data cells are plain text; only the Actions
    // column's links carry navigation (ctrm-standards rule 9 — clear
    // link text, never a raw id or an unrelated value repurposed as
    // the link).
    expect(screen.queryByRole("link", { name: "Wheat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "BUY" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View shipment" })).toHaveAttribute("href", "/logistics/s1");
    expect(screen.getByRole("link", { name: "View trade" })).toHaveAttribute("href", "/trades/t1");

    fireEvent.click(screen.getByRole("link", { name: "View shipment" }));
    await waitFor(() => expect(screen.getByText("Shipment detail page")).toBeInTheDocument());
  });

  it("shows a clear error message when the shipments request fails entirely (network error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, []);
      return Promise.reject(new Error("Network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading shipments...")).not.toBeInTheDocument();
  });

  it("applies a status filter present in the URL on initial render", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics("/logistics?status=PLANNED");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => typeof u === "string" && u.includes("status=PLANNED"))).toBe(true),
    );
  });

  it("changing the warehouse filter updates the URL query params and refetches with that filter", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();
    await waitFor(() => expect(screen.getByLabelText("Warehouse")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("option", { name: "Rotterdam Silo" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Warehouse"), { target: { value: "w1" } });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("warehouseId=w1"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => typeof u === "string" && u.includes("warehouseId=w1"))).toBe(true),
    );
  });

  it("does not show a Clear filters button when no filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("shows a Clear filters button when only the status filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics("/logistics?status=PLANNED");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("shows a Clear filters button when only the warehouse filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics("/logistics?warehouseId=w1");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("shows a Clear filters button when a filter is changed interactively", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics();
    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PLANNED" } });

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("clicking Clear filters with both filters set resets both of them and refetches the unfiltered list", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/warehouses") return jsonResponse(200, warehouses);
      if (url.startsWith("/api/shipments")) return jsonResponse(200, [shipment]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLogistics("/logistics?status=PLANNED&warehouseId=w1");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
    expect(screen.getByLabelText("Status")).toHaveValue("PLANNED");
    expect(screen.getByLabelText("Warehouse")).toHaveValue("w1");

    fetchMock.mockClear();
    fireEvent.click(screen.getByText("Clear filters"));

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(""));
    expect(screen.getByLabelText("Status")).toHaveValue("");
    expect(screen.getByLabelText("Warehouse")).toHaveValue("");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === "/api/shipments")).toBe(true));
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });
});

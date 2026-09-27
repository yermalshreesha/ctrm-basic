import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/pages/Dashboard";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function neverResolves(): Promise<never> {
  return new Promise(() => {});
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trades/:id" element={<div>Trade detail page</div>} />
        <Route path="/logistics/:id" element={<div>Shipment detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const balance = {
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  commodityId: "c1",
  commodityName: "Wheat",
  quantityMt: "250.000",
  updatedAt: "2026-01-05T00:00:00.000Z",
};

const shipment = {
  id: "s1",
  tradeId: "t1",
  commodityId: "c1",
  commodityName: "Wheat",
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  quantityMt: "100.000",
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

// Fetch handler covering all three dashboard endpoints; `overrides` lets a
// test replace one or more endpoints' response with something else (an
// error, an empty list, a deliberately-pending promise for the
// independent-loading test).
function stubDashboardFetch(overrides: Partial<Record<string, () => Promise<unknown>>> = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (overrides[url]) return overrides[url]();
    if (url === "/api/dashboard/positions") return jsonResponse(200, []);
    if (url === "/api/dashboard/inventory-summary") return jsonResponse(200, []);
    if (url === "/api/dashboard/shipments-in-progress") return jsonResponse(200, []);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one row per position, with a positive, a negative and a zero position all shown exactly as returned", async () => {
    const positions = [
      { commodityId: "c1", commodityName: "Wheat", netPositionMt: "300.000" },
      { commodityId: "c2", commodityName: "Arabica Coffee", netPositionMt: "-150.000" },
      { commodityId: "c3", commodityName: "Sugar ICUMSA 45", netPositionMt: "0.000" },
    ];
    stubDashboardFetch({ "/api/dashboard/positions": () => jsonResponse(200, positions) });

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());
    expect(screen.getByText("300.000")).toBeInTheDocument();
    expect(screen.getByText("-150.000")).toBeInTheDocument();
    expect(screen.getByText("0.000")).toBeInTheDocument();
  });

  it("shows the API's netPositionMt as-is even when it doesn't equal boughtMt minus soldMt, proving nothing is recomputed in the browser", async () => {
    // boughtMt - soldMt would be 100.000 here; the API's netPositionMt
    // deliberately disagrees, to prove the component displays the field
    // it was given rather than deriving its own value from any other
    // field that happens to be present on the response.
    const positions = [
      { commodityId: "c1", commodityName: "Wheat", boughtMt: "300.000", soldMt: "200.000", netPositionMt: "999.000" },
    ];
    stubDashboardFetch({ "/api/dashboard/positions": () => jsonResponse(200, positions) });

    renderDashboard();

    await waitFor(() => expect(screen.getByText("999.000")).toBeInTheDocument());
    expect(screen.queryByText("100.000")).not.toBeInTheDocument();
  });

  it("shows a clear message when there are no positions", async () => {
    stubDashboardFetch();

    renderDashboard();

    await waitFor(() => expect(screen.getByText("No open positions.")).toBeInTheDocument());
  });

  it("shows a clear error message when the positions request fails, without blocking the other sections", async () => {
    stubDashboardFetch({
      "/api/dashboard/positions": () => Promise.reject(new Error("Network error")),
      "/api/dashboard/inventory-summary": () => jsonResponse(200, [balance]),
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading positions...")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Rotterdam Silo")).toBeInTheDocument());
  });

  it("renders one row per inventory balance, with quantities shown exactly as returned", async () => {
    stubDashboardFetch({ "/api/dashboard/inventory-summary": () => jsonResponse(200, [balance]) });

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Rotterdam Silo")).toBeInTheDocument());
    expect(screen.getByText("Wheat")).toBeInTheDocument();
    expect(screen.getByText("250.000")).toBeInTheDocument();
  });

  it("shows a clear message when there is no stock", async () => {
    stubDashboardFetch();

    renderDashboard();

    await waitFor(() => expect(screen.getByText("No stock currently in inventory.")).toBeInTheDocument());
  });

  it("shows a clear error message when the inventory-summary request fails, independently of the other sections", async () => {
    stubDashboardFetch({
      "/api/dashboard/inventory-summary": () => Promise.reject(new Error("Network error")),
      "/api/dashboard/positions": () =>
        jsonResponse(200, [{ commodityId: "c1", commodityName: "Wheat", netPositionMt: "300.000" }]),
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading inventory summary...")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());
  });

  it("renders one row per shipment in progress, with all spec columns shown exactly as returned, linked to its trade and its shipment via clear link text", async () => {
    stubDashboardFetch({ "/api/dashboard/shipments-in-progress": () => jsonResponse(200, [shipment]) });

    renderDashboard();

    await waitFor(() => expect(screen.getByText("PLANNED")).toBeInTheDocument());
    const table = within(screen.getByText("PLANNED").closest("table") as HTMLTableElement);

    // Data cells (direction, transport mode) are plain text; the Actions
    // column's links carry navigation, with clear text — never the raw
    // direction/transport-mode values (ctrm-standards rule 9).
    expect(table.queryByRole("link", { name: "BUY" })).not.toBeInTheDocument();
    expect(table.queryByRole("link", { name: "VESSEL" })).not.toBeInTheDocument();
    expect(table.getByRole("link", { name: "View trade" })).toHaveAttribute("href", "/trades/t1");
    expect(table.getByRole("link", { name: "View shipment" })).toHaveAttribute("href", "/logistics/s1");
    expect(table.getByText("BUY")).toBeInTheDocument();
    expect(table.getByText("VESSEL")).toBeInTheDocument();
    expect(table.getByText("Rotterdam → Antwerp")).toBeInTheDocument();
    expect(table.getByText("2026-01-20 – 2026-01-25")).toBeInTheDocument();
  });

  it("shows a clear message when there are no shipments in progress", async () => {
    stubDashboardFetch();

    renderDashboard();

    await waitFor(() => expect(screen.getByText("No shipments in progress.")).toBeInTheDocument());
  });

  it("shows a clear error message when the shipments-in-progress request fails, independently of the other sections", async () => {
    stubDashboardFetch({
      "/api/dashboard/shipments-in-progress": () => Promise.reject(new Error("Network error")),
      "/api/dashboard/positions": () =>
        jsonResponse(200, [{ commodityId: "c1", commodityName: "Wheat", netPositionMt: "300.000" }]),
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading shipments in progress...")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());
  });

  it("loads each section independently — one section's data appears before the other two have resolved", async () => {
    stubDashboardFetch({
      "/api/dashboard/positions": () =>
        jsonResponse(200, [{ commodityId: "c1", commodityName: "Wheat", netPositionMt: "300.000" }]),
      "/api/dashboard/inventory-summary": neverResolves,
      "/api/dashboard/shipments-in-progress": neverResolves,
    });

    renderDashboard();

    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());
    expect(screen.getByText("Loading inventory summary...")).toBeInTheDocument();
    expect(screen.getByText("Loading shipments in progress...")).toBeInTheDocument();
  });

  it("does not show the Phase 5 backend-connectivity placeholder", async () => {
    stubDashboardFetch();

    renderDashboard();

    await waitFor(() => expect(screen.getByText("No open positions.")).toBeInTheDocument());
    expect(screen.queryByText(/Backend:/)).not.toBeInTheDocument();
  });
});

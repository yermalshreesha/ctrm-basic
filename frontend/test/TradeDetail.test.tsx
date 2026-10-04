import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TradeStatus, TradeWithShipments } from "../src/api/types";
import { TradeDetail } from "../src/pages/TradeDetail";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function buildTrade(overrides: Partial<TradeWithShipments> = {}): TradeWithShipments {
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
    status: "DRAFT",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    shipments: [],
    remainingQuantityMt: "300.000",
    ...overrides,
  };
}

// Only serves GET /api/commodities, /api/counterparties and
// GET /api/trades/:id — for tests that don't exercise an action.
function mockFetch(tradeBody: unknown, status = 200) {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
    if (url.startsWith("/api/trades/")) return jsonResponse(status, tradeBody);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/trades/${id}`]}>
      <Routes>
        <Route path="/trades/:id" element={<TradeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading trade...")).not.toBeInTheDocument());
}

describe("TradeDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Confirm and Cancel (not Complete) for a DRAFT trade", async () => {
    mockFetch(buildTrade({ status: "DRAFT" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("shows Complete and Cancel (not Confirm) for a CONFIRMED trade", async () => {
    mockFetch(buildTrade({ status: "CONFIRMED" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("shows no action buttons for a COMPLETED trade", async () => {
    mockFetch(buildTrade({ status: "COMPLETED" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("confirming a DRAFT trade calls confirm, refetches, and shows CONFIRMED", async () => {
    let status: TradeStatus = "DRAFT";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status }));
      if (url === "/api/trades/t1/confirm" && method === "POST") {
        status = "CONFIRMED";
        return jsonResponse(200, buildTrade({ status }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("CONFIRMED")).toBeInTheDocument());

    const getCalls = fetchMock.mock.calls.filter(
      ([u, i]) => u === "/api/trades/t1" && ((i as RequestInit | undefined)?.method ?? "GET") === "GET",
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("asks for confirmation before cancelling; declining sends no request, confirming does", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status: "CONFIRMED" }));
      if (url === "/api/trades/t1/cancel" && method === "POST") {
        return jsonResponse(200, buildTrade({ status: "CANCELLED" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/trades/t1/cancel")).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => u === "/api/trades/t1/cancel" && (i as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("asks for confirmation before completing; declining sends no request, confirming does", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status: "CONFIRMED" }));
      if (url === "/api/trades/t1/complete" && method === "POST") {
        return jsonResponse(200, buildTrade({ status: "COMPLETED" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/trades/t1/complete")).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => u === "/api/trades/t1/complete" && (i as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("shows the backend's message in an error banner when Cancel is rejected (409)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const message = "Cannot cancel trade: it has 1 shipment(s) attached — delete any PLANNED ones first";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status: "CONFIRMED" }));
      if (url === "/api/trades/t1/cancel" && method === "POST") {
        return jsonResponse(409, { error: "shipments_exist", message, shipmentIds: ["s1"] });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
  });

  it("shows the backend's message in an error banner when Complete is rejected (409)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const message = "Cannot complete trade: shipments total 0.000 MT of 300.000 MT, all DELIVERED: false";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status: "CONFIRMED" }));
      if (url === "/api/trades/t1/complete" && method === "POST") {
        return jsonResponse(409, { error: "cannot_complete", message });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
  });

  it("disables action buttons while a request is running", async () => {
    let status: TradeStatus = "DRAFT";
    let resolveConfirm: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") return jsonResponse(200, buildTrade({ status }));
      if (url === "/api/trades/t1/confirm" && method === "POST") {
        return new Promise((resolve) => {
          resolveConfirm = () => {
            status = "CONFIRMED";
            resolve(jsonResponse(200, buildTrade({ status })));
          };
        });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveConfirm(undefined);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument());
  });

  it("renders a CONFIRMED trade's shipments as a table with a clearly-labelled link to each shipment's detail page", async () => {
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
      destination: "Rotterdam",
      plannedDepartureDate: "2026-01-20",
      plannedArrivalDate: "2026-01-25",
      actualDepartureDate: null,
      actualArrivalDate: null,
      status: "PLANNED",
      trade: { id: "t1", direction: "BUY" as const, status: "CONFIRMED" as const },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockFetch(buildTrade({ status: "CONFIRMED", shipments: [shipment], remainingQuantityMt: "200.000" }));

    renderDetail("t1");
    await waitForLoaded();

    expect(screen.queryByRole("link", { name: "s1" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View shipment" })).toHaveAttribute("href", "/logistics/s1");
    expect(screen.getByText("Rotterdam Silo")).toBeInTheDocument();
    expect(screen.getByText("100.000")).toBeInTheDocument();
  });

  it("shows the trade's remainingQuantityMt and an Add shipment link for a CONFIRMED trade", async () => {
    mockFetch(buildTrade({ status: "CONFIRMED", remainingQuantityMt: "199.700" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.getByText(/Remaining to ship: 199.700 MT/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add shipment" })).toHaveAttribute(
      "href",
      "/logistics/new?tradeId=t1",
    );
  });

  it.each(["DRAFT", "COMPLETED", "CANCELLED"] as const)(
    "hides the Add shipment link and remaining-quantity line for a %s trade",
    async (status) => {
      mockFetch(buildTrade({ status }));
      renderDetail("t1");
      await waitForLoaded();

      expect(screen.queryByRole("link", { name: "Add shipment" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Remaining to ship/)).not.toBeInTheDocument();
    },
  );

  it("shows notes on a read-only (non-DRAFT) trade when present", async () => {
    mockFetch(buildTrade({ status: "CONFIRMED", notes: "Buyer wants early delivery" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Buyer wants early delivery")).toBeInTheDocument();
  });

  it("shows no Notes row on a read-only trade when notes is null", async () => {
    mockFetch(buildTrade({ status: "CONFIRMED", notes: null }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("displays quantityMt and price exactly as the API returns them", async () => {
    mockFetch(buildTrade({ status: "CONFIRMED", quantityMt: "1200.500", price: "45.75" }));
    renderDetail("t1");
    await waitForLoaded();

    expect(screen.getByText("1200.500")).toBeInTheDocument();
    expect(screen.getByText("45.75")).toBeInTheDocument();
  });

  it("shows a clear error message when the trade fetch fails entirely (network error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      return Promise.reject(new Error("Network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading trade...")).not.toBeInTheDocument();
  });

  it("shows 'Trade not found' for an unknown trade id (404)", async () => {
    mockFetch({ error: "not_found", message: "Trade t1 not found" }, 404);
    renderDetail("t1");

    await waitFor(() => expect(screen.getByText("Trade not found")).toBeInTheDocument());
  });

  it("saves an edited DRAFT trade via PATCH, then refetches and displays the server's returned values", async () => {
    let getCount = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades/t1" && method === "GET") {
        getCount += 1;
        return getCount === 1
          ? jsonResponse(200, buildTrade({ quantityMt: "100.000", updatedAt: "2026-01-01T00:00:00.000Z" }))
          : jsonResponse(200, buildTrade({ quantityMt: "150.500", updatedAt: "2026-01-02T00:00:00.000Z" }));
      }
      if (url === "/api/trades/t1" && method === "PATCH") {
        // Deliberately different from the refetch above, to prove the
        // page displays the refetched GET response, not this one.
        return jsonResponse(200, buildTrade({ quantityMt: "999.999" }));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderDetail("t1");
    await waitFor(() => expect(screen.getByLabelText("Quantity (MT)")).toHaveValue("100.000"));

    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "999.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Quantity (MT)")).toHaveValue("150.500"));

    const patchCalls = fetchMock.mock.calls.filter(
      ([u, i]) => u === "/api/trades/t1" && (i as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCalls).toHaveLength(1);
  });
});

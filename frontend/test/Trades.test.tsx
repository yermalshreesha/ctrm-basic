import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Trades } from "../src/pages/Trades";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderTrades(initialEntry = "/trades") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationDisplay />
      <Routes>
        <Route path="/trades" element={<Trades />} />
        <Route path="/trades/new" element={<div>New trade page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const commodities = [{ id: "c1", name: "Wheat", category: "GRAIN", unit: "MT", createdAt: "", updatedAt: "" }];
const counterparties = [{ id: "cp1", name: "Acme Grain Co", type: "BUYER", createdAt: "", updatedAt: "" }];

const trade = {
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Trades", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one row per trade returned by the API, in the order the API returns them", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade, { ...trade, id: "t2" }]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();

    // Header row + 2 trade rows, in API order (no client re-sorting).
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
  });

  it("links each row to its trade detail page via clear link text, never the commodity name", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const table = within(screen.getByRole("table"));

    expect(table.getByText("Wheat")).toBeInTheDocument();
    expect(table.queryByRole("link", { name: "Wheat" })).not.toBeInTheDocument();
    expect(table.getByRole("link", { name: "View trade" })).toHaveAttribute("href", "/trades/t1");
  });

  it("shows a clear error message when the trades request fails entirely (network error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      return Promise.reject(new Error("Network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading trades...")).not.toBeInTheDocument();
  });

  it("applies a status filter present in the URL on initial render", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades("/trades?status=CONFIRMED");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => typeof u === "string" && u.includes("status=CONFIRMED"))).toBe(true),
    );
  });

  it("changing the status filter updates the URL query params and refetches with that filter", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();
    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "CONFIRMED" } });

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("status=CONFIRMED"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => typeof u === "string" && u.includes("status=CONFIRMED"))).toBe(true),
    );
  });

  it("does not show a Clear filters button when no filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("shows a Clear filters button when only the status filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades("/trades?status=CONFIRMED");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("shows a Clear filters button when only the commodity filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades("/trades?commodityId=c1");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("shows a Clear filters button when only the direction filter is active", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades("/trades?direction=SELL");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("shows a Clear filters button when a filter is changed interactively", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();
    await waitFor(() => expect(screen.getByLabelText("Status")).toBeInTheDocument());
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "CONFIRMED" } });

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
  });

  it("clicking Clear filters with all three filters set resets all of them and refetches the unfiltered list", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url.startsWith("/api/trades")) return jsonResponse(200, [trade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades("/trades?status=CONFIRMED&commodityId=c1&direction=SELL");

    await waitFor(() => expect(screen.getByText("Clear filters")).toBeInTheDocument());
    expect(screen.getByLabelText("Status")).toHaveValue("CONFIRMED");
    expect(screen.getByLabelText("Commodity")).toHaveValue("c1");
    expect(screen.getByLabelText("Direction")).toHaveValue("SELL");

    fetchMock.mockClear();
    fireEvent.click(screen.getByText("Clear filters"));

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(""));
    expect(screen.getByLabelText("Status")).toHaveValue("");
    expect(screen.getByLabelText("Commodity")).toHaveValue("");
    expect(screen.getByLabelText("Direction")).toHaveValue("");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => u === "/api/trades")).toBe(true),
    );
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it('navigates to /trades/new when "New trade" is clicked', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url.startsWith("/api/trades")) return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTrades();
    await waitFor(() => expect(screen.getByText("New trade")).toBeInTheDocument());

    fireEvent.click(screen.getByText("New trade"));

    await waitFor(() => expect(screen.getByText("New trade page")).toBeInTheDocument());
  });
});

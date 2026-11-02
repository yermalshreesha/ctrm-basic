import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Approvals } from "../src/pages/Approvals";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function renderApprovals() {
  return render(
    <MemoryRouter initialEntries={["/trades/approvals"]}>
      <Routes>
        <Route path="/trades/approvals" element={<Approvals />} />
        <Route path="/trades/:id" element={<div>Trade detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const commodities = [{ id: "c1", name: "Wheat", category: "GRAIN", unit: "MT", createdAt: "", updatedAt: "" }];
const counterparties = [{ id: "cp1", name: "Acme Grain Co", type: "BUYER", createdAt: "", updatedAt: "" }];

const pendingTrade = {
  id: "t1",
  commodityId: "c1",
  direction: "BUY",
  counterpartyId: "cp1",
  quantityMt: "300.000",
  price: "1200.50",
  currency: "USD",
  deliveryPeriodStart: "2026-01-15",
  deliveryPeriodEnd: "2026-02-20",
  status: "PENDING_APPROVAL",
  notes: null,
  approvedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Approvals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and renders only PENDING_APPROVAL trades, with a View trade link to the right trade", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities") return jsonResponse(200, commodities);
      if (url === "/api/counterparties") return jsonResponse(200, counterparties);
      if (url === "/api/trades?status=PENDING_APPROVAL") return jsonResponse(200, [pendingTrade]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApprovals();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Wheat")).toBeInTheDocument();
    expect(table.getByText("Acme Grain Co")).toBeInTheDocument();
    expect(table.getByRole("link", { name: "View trade" })).toHaveAttribute("href", "/trades/t1");
  });

  it("renders an empty table (no 'Coming soon' message) when there are no PENDING_APPROVAL trades", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades?status=PENDING_APPROVAL") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApprovals();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("Coming soon.")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(1); // header row only
  });

  it("approving asks for confirmation; declining sends no request and keeps the row", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades?status=PENDING_APPROVAL" && method === "GET") {
        return jsonResponse(200, [pendingTrade]);
      }
      if (url === "/api/trades/t1/approve" && method === "POST") return jsonResponse(200, { ...pendingTrade, status: "CONFIRMED" });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApprovals();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/trades/t1/approve")).toBe(false);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("approving, once confirmed, calls approve and removes the row", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades?status=PENDING_APPROVAL" && method === "GET") {
        return jsonResponse(200, [pendingTrade]);
      }
      if (url === "/api/trades/t1/approve" && method === "POST") return jsonResponse(200, { ...pendingTrade, status: "CONFIRMED" });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderApprovals();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => u === "/api/trades/t1/approve" && (i as RequestInit)?.method === "POST")).toBe(
        true,
      ),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument());
  });

  it("rejecting, once confirmed, calls reject and removes the row", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      if (url === "/api/trades?status=PENDING_APPROVAL" && method === "GET") {
        return jsonResponse(200, [pendingTrade]);
      }
      if (url === "/api/trades/t1/reject" && method === "POST") return jsonResponse(200, { ...pendingTrade, status: "DRAFT" });
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderApprovals();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => u === "/api/trades/t1/reject" && (i as RequestInit)?.method === "POST")).toBe(
        true,
      ),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument());
  });

  it("shows a clear error message when the trades request fails entirely (network error)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/commodities" || url === "/api/counterparties") return jsonResponse(200, []);
      return Promise.reject(new Error("Network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApprovals();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading trades...")).not.toBeInTheDocument();
  });
});

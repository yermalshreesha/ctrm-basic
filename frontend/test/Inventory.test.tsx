import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inventory } from "../src/pages/Inventory";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function renderInventory() {
  return render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <Routes>
        <Route path="/inventory" element={<Inventory />} />
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

const inMovement = {
  id: "m1",
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  commodityId: "c1",
  commodityName: "Wheat",
  shipmentId: "s1",
  quantityMt: "350.000",
  createdAt: "2026-01-04T10:30:00.000Z",
};

const outMovement = {
  id: "m2",
  warehouseId: "w1",
  warehouseName: "Rotterdam Silo",
  commodityId: "c1",
  commodityName: "Wheat",
  shipmentId: "s2",
  quantityMt: "-100.000",
  createdAt: "2026-01-05T14:15:00.000Z",
};

describe("Inventory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders one row per balance, with quantities shown exactly as the API returns them", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, [balance]);
      if (url === "/api/inventory/movements") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByText("Rotterdam Silo")).toBeInTheDocument());
    expect(screen.getByText("Wheat")).toBeInTheDocument();
    expect(screen.getByText("250.000")).toBeInTheDocument();
  });

  it("shows a clear message when there is no stock", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, []);
      if (url === "/api/inventory/movements") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByText("No stock currently in inventory.")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a clear error message when the stock request fails, without blocking the movements section", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return Promise.reject(new Error("Network error"));
      if (url === "/api/inventory/movements") return jsonResponse(200, [inMovement]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading inventory...")).not.toBeInTheDocument();
    // The movements section isn't blocked by the stock section's failure.
    await waitFor(() => expect(screen.getByText("Wheat")).toBeInTheDocument());
  });

  it("renders one row per movement, in API order, including a negative movement shown exactly as returned", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, []);
      if (url === "/api/inventory/movements") return jsonResponse(200, [inMovement, outMovement]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(screen.getByText("350.000")).toBeInTheDocument();
    expect(screen.getByText("-100.000")).toBeInTheDocument();
  });

  it("shows a clear message when there are no movements yet", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, [balance]);
      if (url === "/api/inventory/movements") return jsonResponse(200, []);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByText("No stock movements yet.")).toBeInTheDocument());
  });

  it("shows a clear error message when the movements request fails, independently of the stock section", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, [balance]);
      if (url === "/api/inventory/movements") return Promise.reject(new Error("Network error"));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network error"));
    expect(screen.queryByText("Loading movements...")).not.toBeInTheDocument();
    // The stock section isn't blocked by the movements section's failure.
    await waitFor(() => expect(screen.getByText("Rotterdam Silo")).toBeInTheDocument());
  });

  it("links each movement row to its shipment", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, []);
      if (url === "/api/inventory/movements") return jsonResponse(200, [inMovement]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    await waitFor(() => expect(screen.getByRole("link", { name: "s1" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "s1" })).toHaveAttribute("href", "/logistics/s1");
  });

  it("renders each movement's date as a readable local date/time, not the raw timestamp", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/inventory") return jsonResponse(200, []);
      if (url === "/api/inventory/movements") return jsonResponse(200, [inMovement]);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderInventory();

    // Computed the same way the component formats it, so this assertion
    // doesn't depend on which timezone the test happens to run in.
    const expected = new Date(inMovement.createdAt).toLocaleString();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    const table = within(screen.getByRole("table"));
    expect(table.getByText(expected)).toBeInTheDocument();
    expect(table.queryByText(inMovement.createdAt)).not.toBeInTheDocument();
  });
});

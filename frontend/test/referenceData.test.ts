import { afterEach, describe, expect, it, vi } from "vitest";
import { listCommodities, listCounterparties, listWarehouses } from "../src/api/referenceData";

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("referenceData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listCommodities calls GET /api/commodities and returns the parsed array", async () => {
    const body = [{ id: "c1", name: "Wheat", category: "GRAIN", unit: "MT", createdAt: "", updatedAt: "" }];
    const fetchMock = mockFetchOnce(body);

    const result = await listCommodities();

    expect(fetchMock).toHaveBeenCalledWith("/api/commodities", expect.anything());
    expect(result).toEqual(body);
  });

  it("listCounterparties calls GET /api/counterparties and returns the parsed array", async () => {
    const body = [{ id: "cp1", name: "Acme Grain Co", type: "BUYER", createdAt: "", updatedAt: "" }];
    const fetchMock = mockFetchOnce(body);

    const result = await listCounterparties();

    expect(fetchMock).toHaveBeenCalledWith("/api/counterparties", expect.anything());
    expect(result).toEqual(body);
  });

  it("listWarehouses calls GET /api/warehouses and returns the parsed array", async () => {
    const body = [{ id: "w1", name: "Rotterdam Silo", location: "Rotterdam", createdAt: "", updatedAt: "" }];
    const fetchMock = mockFetchOnce(body);

    const result = await listWarehouses();

    expect(fetchMock).toHaveBeenCalledWith("/api/warehouses", expect.anything());
    expect(result).toEqual(body);
  });
});

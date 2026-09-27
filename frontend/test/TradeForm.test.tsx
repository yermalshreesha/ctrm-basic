import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "../src/api/types";
import { TradeForm } from "../src/components/TradeForm";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

function mockReferenceData(commodities: unknown[] = [], counterparties: unknown[] = []) {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/commodities") return jsonResponse(200, commodities);
    if (url === "/api/counterparties") return jsonResponse(200, counterparties);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const baseTrade: Trade = {
  id: "t1",
  commodityId: "c1",
  direction: "BUY",
  counterpartyId: "cp1",
  quantityMt: "300.100",
  price: "1200.50",
  currency: "USD",
  deliveryPeriodStart: "2026-01-15",
  deliveryPeriodEnd: "2026-02-20",
  status: "DRAFT",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TradeForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends quantityMt and price exactly as typed, using values a number conversion would change", async () => {
    mockReferenceData(
      [{ id: "c1", name: "Wheat", category: "GRAIN", unit: "MT", createdAt: "", updatedAt: "" }],
      [{ id: "cp1", name: "Acme Grain Co", type: "BUYER", createdAt: "", updatedAt: "" }],
    );
    const onSubmit = vi.fn();
    render(<TradeForm onSubmit={onSubmit} submitting={false} fieldErrors={[]} />);

    await waitFor(() => expect(screen.getByRole("option", { name: "Wheat" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Commodity"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Counterparty"), { target: { value: "cp1" } });
    // "300.10" would become 300.1 (dropping the trailing zero) and
    // "1200.50" would become 1200.5 under a naive Number()/parseFloat()
    // round-trip — exactly the kind of value BR-1 requires to survive
    // untouched.
    fireEvent.change(screen.getByLabelText("Quantity (MT)"), { target: { value: "300.10" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "1200.50" } });
    fireEvent.change(screen.getByLabelText("Delivery period start"), { target: { value: "2026-01-15" } });
    fireEvent.change(screen.getByLabelText("Delivery period end"), { target: { value: "2026-02-20" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ quantityMt: "300.10", price: "1200.50" }));
  });

  it("shows an inline required message and does not submit when a required field is empty", () => {
    mockReferenceData();
    const onSubmit = vi.fn();
    render(<TradeForm onSubmit={onSubmit} submitting={false} fieldErrors={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByText("This field is required").length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a 400 field error next to the matching field (price)", () => {
    mockReferenceData();
    render(
      <TradeForm
        initial={baseTrade}
        onSubmit={vi.fn()}
        submitting={false}
        fieldErrors={[{ field: "price", message: "price must be greater than 0" }]}
      />,
    );

    expect(screen.getByLabelText("Price").closest("div")).toHaveTextContent("price must be greater than 0");
  });

  it("renders a deliveryPeriodEnd field error next to that field", () => {
    mockReferenceData();
    render(
      <TradeForm
        initial={baseTrade}
        onSubmit={vi.fn()}
        submitting={false}
        fieldErrors={[
          { field: "deliveryPeriodEnd", message: "deliveryPeriodEnd must be on or after deliveryPeriodStart" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Delivery period end").closest("div")).toHaveTextContent(
      "deliveryPeriodEnd must be on or after deliveryPeriodStart",
    );
  });

  it("disables the Save button while submitting and ignores a click", () => {
    mockReferenceData();
    const onSubmit = vi.fn();
    render(<TradeForm initial={baseTrade} onSubmit={onSubmit} submitting={true} fieldErrors={[]} />);

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders delivery period dates exactly as provided, with no reformatting", () => {
    mockReferenceData();
    render(<TradeForm initial={baseTrade} onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);

    expect(screen.getByLabelText("Delivery period start")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("Delivery period end")).toHaveValue("2026-02-20");
  });

  it("populates the commodity and counterparty dropdowns from the reference-data API responses", async () => {
    mockReferenceData(
      [{ id: "c1", name: "Arabica Coffee", category: "COFFEE", unit: "MT", createdAt: "", updatedAt: "" }],
      [{ id: "cp1", name: "Global Traders Ltd", type: "SELLER", createdAt: "", updatedAt: "" }],
    );
    render(<TradeForm onSubmit={vi.fn()} submitting={false} fieldErrors={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Arabica Coffee" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Global Traders Ltd" })).toBeInTheDocument();
    });
  });
});

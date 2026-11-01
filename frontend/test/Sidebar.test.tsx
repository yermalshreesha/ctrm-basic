import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "../src/components/Sidebar";

describe("Sidebar", () => {
  it("renders Dashboard, Logistics and Inventory as links and Trades as a non-link section header, with both sections' sub-items hidden while on another section", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Logistics", "Inventory"]);
    expect(screen.queryByRole("link", { name: "Trades" })).not.toBeInTheDocument();
    expect(screen.getByText("Trades")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Shipment listing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sales fulfillment" })).not.toBeInTheDocument();
  });

  it("shows Trades's sub-items, linked to their own routes, while on a Trades sub-page, with the top-level label still not a link", () => {
    render(
      <MemoryRouter initialEntries={["/trades/trades"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    // "Trades" labels both the non-link section header and its first
    // sub-item — role "link" only matches the sub-item's <a>, proving
    // there's exactly one link (not two), pointing at the sub-item's route.
    const tradesLinks = screen.getAllByRole("link", { name: "Trades" });
    expect(tradesLinks).toHaveLength(1);
    expect(tradesLinks[0]).toHaveAttribute("href", "/trades/trades");
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/trades/approvals");
  });

  it("keeps Trades's sub-items visible while on the existing (now unlinked) Trades list or a trade detail page", () => {
    render(
      <MemoryRouter initialEntries={["/trades"]}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={["/trades/some-trade-id"]}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: "Approvals" }).length).toBeGreaterThan(0);
  });

  it("shows Logistics's sub-items, linked to their own routes, while on the Logistics list page", () => {
    render(
      <MemoryRouter initialEntries={["/logistics"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Logistics",
      "Shipment listing",
      "Sales fulfillment",
      "Inventory",
    ]);
    expect(screen.getByText("Trades")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trades" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shipment listing" })).toHaveAttribute(
      "href",
      "/logistics/shipment-listing",
    );
    expect(screen.getByRole("link", { name: "Sales fulfillment" })).toHaveAttribute(
      "href",
      "/logistics/sales-fulfillment",
    );
  });

  it("keeps Logistics's sub-items visible while on one of the sub-pages directly (e.g. after a refresh)", () => {
    render(
      <MemoryRouter initialEntries={["/logistics/shipment-listing"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Shipment listing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sales fulfillment" })).toBeInTheDocument();
  });
});

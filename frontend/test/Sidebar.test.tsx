import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "../src/components/Sidebar";

describe("Sidebar", () => {
  it("renders the four top-level nav links, with Logistics's sub-items hidden while on another section", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Trades", "Logistics", "Inventory"]);
    expect(screen.queryByRole("link", { name: "Shipment listing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sales fulfillment" })).not.toBeInTheDocument();
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
      "Trades",
      "Logistics",
      "Shipment listing",
      "Sales fulfillment",
      "Inventory",
    ]);
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

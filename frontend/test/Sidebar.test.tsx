import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "../src/components/Sidebar";

describe("Sidebar", () => {
  it("renders all four top-level entries as links while on another section, with Contracts's and Logistics's sub-items hidden", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Contracts", "Logistics", "Inventory"]);
    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute("href", "/trades/trades");
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Shipment listing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sales fulfillment" })).not.toBeInTheDocument();
  });

  it("shows Contracts's sub-items, linked to their own routes, while on the Trades sub-page, with Contracts still a link", () => {
    render(
      <MemoryRouter initialEntries={["/trades/trades"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute("href", "/trades/trades");
    expect(screen.getByRole("link", { name: "Trades" })).toHaveAttribute("href", "/trades/trades");
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/trades/approvals");
  });

  it("keeps Contracts's sub-items visible while on the legacy /trades URL (redirects to the Trades sub-page)", () => {
    render(
      <MemoryRouter initialEntries={["/trades"]}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/trades/approvals");
    expect(screen.getByRole("link", { name: "Trades" })).toHaveAttribute("href", "/trades/trades");
  });

  it("keeps Contracts's sub-items visible while on a trade detail page", () => {
    render(
      <MemoryRouter initialEntries={["/trades/some-trade-id"]}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/trades/approvals");
    expect(screen.getByRole("link", { name: "Trades" })).toHaveAttribute("href", "/trades/trades");
  });

  it("shows Logistics's sub-items, linked to their own routes, while on the Logistics list page, with Contracts still a link (outside its own section)", () => {
    render(
      <MemoryRouter initialEntries={["/logistics"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Dashboard",
      "Contracts",
      "Logistics",
      "Shipment listing",
      "Sales fulfillment",
      "Inventory",
    ]);
    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute("href", "/trades/trades");
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

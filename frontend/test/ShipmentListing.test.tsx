import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShipmentListing } from "../src/pages/ShipmentListing";

describe("ShipmentListing", () => {
  it("renders its title and a 'Coming soon' message, with no data or API calls", () => {
    render(<ShipmentListing />);

    expect(screen.getByRole("heading", { name: "Shipment listing" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon.")).toBeInTheDocument();
  });
});

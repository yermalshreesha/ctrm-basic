import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SalesFulfillment } from "../src/pages/SalesFulfillment";

describe("SalesFulfillment", () => {
  it("renders its title and a 'Coming soon' message, with no data or API calls", () => {
    render(<SalesFulfillment />);

    expect(screen.getByRole("heading", { name: "Sales fulfillment" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon.")).toBeInTheDocument();
  });
});

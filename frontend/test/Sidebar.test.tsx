import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "../src/components/Sidebar";

describe("Sidebar", () => {
  it("renders the four nav links in order", () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Dashboard", "Trades", "Logistics", "Inventory"]);
  });
});

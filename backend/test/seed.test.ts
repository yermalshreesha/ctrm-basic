import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import {
  seed,
  seedCommodities,
  seedCounterparties,
  seedWarehouses,
} from "../prisma/seed.js";

describe("seed script", () => {
  it("creates the expected commodities, counterparties and warehouses", async () => {
    await seed();

    const [commodities, counterparties, warehouses] = await Promise.all([
      prisma.commodity.findMany(),
      prisma.counterparty.findMany(),
      prisma.warehouse.findMany(),
    ]);

    expect(commodities).toHaveLength(seedCommodities.length);
    expect(counterparties).toHaveLength(seedCounterparties.length);
    expect(warehouses).toHaveLength(seedWarehouses.length);

    for (const expected of seedCommodities) {
      expect(commodities).toEqual(
        expect.arrayContaining([expect.objectContaining(expected)]),
      );
    }
    for (const expected of seedCounterparties) {
      expect(counterparties).toEqual(
        expect.arrayContaining([expect.objectContaining(expected)]),
      );
    }
    for (const expected of seedWarehouses) {
      expect(warehouses).toEqual(
        expect.arrayContaining([expect.objectContaining(expected)]),
      );
    }
  });

  it("creates no duplicates when run twice", async () => {
    await seed();
    await seed();

    const [commodities, counterparties, warehouses] = await Promise.all([
      prisma.commodity.findMany(),
      prisma.counterparty.findMany(),
      prisma.warehouse.findMany(),
    ]);

    expect(commodities).toHaveLength(seedCommodities.length);
    expect(counterparties).toHaveLength(seedCounterparties.length);
    expect(warehouses).toHaveLength(seedWarehouses.length);
  });
});

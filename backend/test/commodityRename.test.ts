import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Change 002 (intent/change-002-add-maize.md): "Corn" is renamed to
// "Maize" in place — same row, same id — via the
// 20261006120000_rename_corn_to_maize migration. These tests read and
// execute that migration's actual SQL file, rather than a hardcoded
// copy of it, so the test and the migration can never drift apart.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENAME_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../prisma/migrations/20261006120000_rename_corn_to_maize/migration.sql",
  ),
  "utf-8",
);

async function createCounterparty(name = `Trader-${randomUUID()}`) {
  return prisma.counterparty.create({ data: { name, type: "BOTH" } });
}

describe("rename: Corn -> Maize (Change 002)", () => {
  it("renames the Commodity row in place, same id, bumps updatedAt, and a trade that used Corn shows Maize afterwards", async () => {
    const corn = await prisma.commodity.create({
      data: { name: "Corn", category: "GRAIN", unit: "MT" },
    });
    const counterparty = await createCounterparty();

    const tradeRes = await request(app).post("/api/trades").send({
      commodityId: corn.id,
      direction: "BUY",
      counterpartyId: counterparty.id,
      quantityMt: "100.000",
      price: "250.50",
      currency: "USD",
      deliveryPeriodStart: "2026-01-01",
      deliveryPeriodEnd: "2026-01-31",
    });
    expect(tradeRes.status).toBe(201);
    const tradeId = tradeRes.body.id as string;

    await prisma.$executeRawUnsafe(RENAME_MIGRATION_SQL);

    const renamed = await prisma.commodity.findUnique({ where: { id: corn.id } });
    expect(renamed).not.toBeNull();
    expect(renamed?.name).toBe("Maize");
    expect(renamed?.id).toBe(corn.id);
    expect(renamed?.updatedAt.getTime()).toBeGreaterThan(corn.updatedAt.getTime());

    const tradeAfterRename = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { commodity: true },
    });
    expect(tradeAfterRename?.commodityId).toBe(corn.id);
    expect(tradeAfterRename?.commodity.name).toBe("Maize");

    const getRes = await request(app).get(`/api/trades/${tradeId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.commodityId).toBe(corn.id);
  });

  it("is idempotent — running the rename twice leaves exactly one row, still named Maize with the same id", async () => {
    const corn = await prisma.commodity.create({
      data: { name: "Corn", category: "GRAIN", unit: "MT" },
    });

    await prisma.$executeRawUnsafe(RENAME_MIGRATION_SQL);
    await prisma.$executeRawUnsafe(RENAME_MIGRATION_SQL);

    const commodities = await prisma.commodity.findMany({
      where: { id: corn.id },
    });
    expect(commodities).toHaveLength(1);
    expect(commodities[0].name).toBe("Maize");
    expect(commodities[0].id).toBe(corn.id);

    const stillNamedCorn = await prisma.commodity.findMany({
      where: { name: "Corn" },
    });
    expect(stillNamedCorn).toHaveLength(0);
  });

  it("is a no-op against a database with no Corn row (e.g. one seeded directly as Maize)", async () => {
    const maize = await prisma.commodity.create({
      data: { name: "Maize", category: "GRAIN", unit: "MT" },
    });

    await prisma.$executeRawUnsafe(RENAME_MIGRATION_SQL);

    const unchanged = await prisma.commodity.findUnique({ where: { id: maize.id } });
    expect(unchanged?.name).toBe("Maize");
    expect(unchanged?.id).toBe(maize.id);
    expect(unchanged?.updatedAt.getTime()).toBe(maize.updatedAt.getTime());
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

async function createCommodity(name = `Wheat-${randomUUID()}`) {
  return prisma.commodity.create({ data: { name, category: "GRAIN", unit: "MT" } });
}

async function createWarehouse(name = `Warehouse-${randomUUID()}`) {
  return prisma.warehouse.create({ data: { name, location: "Rotterdam" } });
}

async function createCounterparty(name = `Trader-${randomUUID()}`) {
  return prisma.counterparty.create({ data: { name, type: "BOTH" } });
}

async function createTrade(
  overrides: {
    direction?: "BUY" | "SELL";
    quantityMt?: string;
    status?: "DRAFT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
    commodityId?: string;
  } = {},
) {
  const commodityId = overrides.commodityId ?? (await createCommodity()).id;
  const counterparty = await createCounterparty();
  return prisma.trade.create({
    data: {
      commodityId,
      counterpartyId: counterparty.id,
      direction: overrides.direction ?? "BUY",
      quantityMt: overrides.quantityMt ?? "500.000",
      price: "100.00",
      currency: "USD",
      deliveryPeriodStart: new Date("2026-01-01"),
      deliveryPeriodEnd: new Date("2026-12-31"),
      status: overrides.status ?? "CONFIRMED",
    },
  });
}

function shipmentBody(tradeId: string, warehouseId: string, overrides: Record<string, unknown> = {}) {
  return {
    tradeId,
    warehouseId,
    quantityMt: "100.000",
    transportMode: "TRUCK",
    origin: "Origin Port",
    destination: "Destination Port",
    plannedDepartureDate: "2026-01-05",
    plannedArrivalDate: "2026-01-10",
    ...overrides,
  };
}

async function createShipment(tradeId: string, warehouseId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/shipments").send(shipmentBody(tradeId, warehouseId, overrides));
  return res.body;
}

describe("dashboard", () => {
  describe("GET /api/dashboard/positions", () => {
    it("returns an empty array when there are no CONFIRMED/COMPLETED trades", async () => {
      const res = await request(app).get("/api/dashboard/positions");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("computes net position as BUY minus SELL across CONFIRMED and COMPLETED trades, excluding DRAFT and CANCELLED (AC-7)", async () => {
      const commodity = await createCommodity("Wheat");
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "300.000", status: "CONFIRMED" });
      await createTrade({ commodityId: commodity.id, direction: "SELL", quantityMt: "120.000", status: "COMPLETED" });
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "999.000", status: "DRAFT" });
      await createTrade({ commodityId: commodity.id, direction: "SELL", quantityMt: "999.000", status: "CANCELLED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        commodityId: commodity.id,
        commodityName: "Wheat",
        netPositionMt: "180.000",
      });
    });

    it("keeps each commodity's position independent and supports a negative (net-sold) position", async () => {
      const wheat = await createCommodity("Wheat");
      const coffee = await createCommodity("Arabica Coffee");
      await createTrade({ commodityId: wheat.id, direction: "BUY", quantityMt: "100.000", status: "CONFIRMED" });
      await createTrade({ commodityId: coffee.id, direction: "SELL", quantityMt: "50.000", status: "CONFIRMED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ commodityId: wheat.id, netPositionMt: "100.000" }),
          expect.objectContaining({ commodityId: coffee.id, netPositionMt: "-50.000" }),
        ]),
      );
    });

    it("omits a commodity with only DRAFT/CANCELLED trades entirely, rather than reporting a zero position", async () => {
      const commodity = await createCommodity("Sugar ICUMSA 45");
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "10.000", status: "DRAFT" });
      await createTrade({ commodityId: commodity.id, direction: "SELL", quantityMt: "10.000", status: "CANCELLED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("still appears (with a net position of exactly zero) when CONFIRMED/COMPLETED BUY and SELL quantities are equal", async () => {
      const commodity = await createCommodity("Wheat");
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "150.000", status: "CONFIRMED" });
      await createTrade({ commodityId: commodity.id, direction: "SELL", quantityMt: "150.000", status: "COMPLETED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ commodityId: commodity.id, netPositionMt: "0.000" });
    });

    it("counts a COMPLETED trade toward the position even with no other trades on that commodity", async () => {
      const commodity = await createCommodity("Wheat");
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "75.000", status: "COMPLETED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ commodityId: commodity.id, netPositionMt: "75.000" });
    });

    it("sums decimal quantities exactly, not as a binary-float rounding artifact (e.g. 100.100 + 200.200 = 300.300)", async () => {
      const commodity = await createCommodity("Wheat");
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "100.100", status: "CONFIRMED" });
      await createTrade({ commodityId: commodity.id, direction: "BUY", quantityMt: "200.200", status: "COMPLETED" });

      const res = await request(app).get("/api/dashboard/positions");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ commodityId: commodity.id, netPositionMt: "300.300" });
    });
  });

  describe("GET /api/dashboard/inventory-summary", () => {
    it("returns an empty array when there is no balance data", async () => {
      const res = await request(app).get("/api/dashboard/inventory-summary");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("matches the InventoryBalance rows, in the same shape as GET /api/inventory", async () => {
      const warehouse = await createWarehouse("Rotterdam Silo 1");
      const commodity = await createCommodity("Wheat");
      await prisma.inventoryBalance.create({
        data: { warehouseId: warehouse.id, commodityId: commodity.id, quantityMt: "12.345" },
      });

      const [dashboardRes, inventoryRes] = await Promise.all([
        request(app).get("/api/dashboard/inventory-summary"),
        request(app).get("/api/inventory"),
      ]);

      expect(dashboardRes.status).toBe(200);
      expect(dashboardRes.body).toHaveLength(1);
      expect(dashboardRes.body[0]).toMatchObject({
        warehouseId: warehouse.id,
        warehouseName: "Rotterdam Silo 1",
        commodityId: commodity.id,
        commodityName: "Wheat",
        quantityMt: "12.345",
      });
      expect(dashboardRes.body).toEqual(inventoryRes.body);
    });
  });

  describe("GET /api/dashboard/shipments-in-progress", () => {
    it("returns an empty array when there are no shipments", async () => {
      const res = await request(app).get("/api/dashboard/shipments-in-progress");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("lists only PLANNED and IN_TRANSIT shipments, excluding DELIVERED", async () => {
      const trade = await createTrade({ direction: "BUY", quantityMt: "500.000" });
      const warehouse = await createWarehouse();
      const planned = await createShipment(trade.id, warehouse.id, { quantityMt: "100.000" });
      const inTransit = await createShipment(trade.id, warehouse.id, { quantityMt: "100.000" });
      await request(app).post(`/api/shipments/${inTransit.id}/depart`);
      const delivered = await createShipment(trade.id, warehouse.id, { quantityMt: "100.000" });
      await request(app).post(`/api/shipments/${delivered.id}/depart`);
      await request(app).post(`/api/shipments/${delivered.id}/deliver`);

      const res = await request(app).get("/api/dashboard/shipments-in-progress");

      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining([planned.id, inTransit.id]));
      expect(ids).not.toContain(delivered.id);
    });

    it("shipments returned include trade, transport mode, origin/destination and planned dates for the dashboard table", async () => {
      const trade = await createTrade({ direction: "SELL", quantityMt: "500.000" });
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, {
        quantityMt: "50.000",
        transportMode: "VESSEL",
        origin: "Rotterdam Port",
        destination: "Santos Port",
      });

      const res = await request(app).get("/api/dashboard/shipments-in-progress");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: shipment.id,
            transportMode: "VESSEL",
            origin: "Rotterdam Port",
            destination: "Santos Port",
            status: "PLANNED",
            plannedDepartureDate: "2026-01-05",
            plannedArrivalDate: "2026-01-10",
            trade: expect.objectContaining({ id: trade.id, direction: "SELL" }),
          }),
        ]),
      );
    });
  });
});

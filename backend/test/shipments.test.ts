import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { localToday } from "../src/shared/dates.js";

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

async function createCommodity(name = `Wheat-${randomUUID()}`) {
  return prisma.commodity.create({ data: { name, category: "GRAIN", unit: "MT" } });
}

async function createCounterparty(name = `Trader-${randomUUID()}`) {
  return prisma.counterparty.create({ data: { name, type: "BOTH" } });
}

async function createWarehouse(name = `Warehouse-${randomUUID()}`) {
  return prisma.warehouse.create({ data: { name, location: "Rotterdam" } });
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

function balanceOf(warehouseId: string, commodityId: string) {
  return prisma.inventoryBalance.findUnique({
    where: { warehouseId_commodityId: { warehouseId, commodityId } },
  });
}

describe("shipments", () => {
  describe("create (POST /api/shipments)", () => {
    it("creates a shipment under a CONFIRMED trade and returns 201 with status PLANNED", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id));

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PLANNED");
      expect(res.body.tradeId).toBe(trade.id);
      expect(res.body.warehouseId).toBe(warehouse.id);
    });

    it("rejects creating under a DRAFT trade with 409", async () => {
      const trade = await createTrade({ status: "DRAFT" });
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id));
      expect(res.status).toBe(409);
    });

    it("rejects creating under a CANCELLED trade with 409", async () => {
      const trade = await createTrade({ status: "CANCELLED" });
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id));
      expect(res.status).toBe(409);
    });

    it("rejects creating under a COMPLETED trade with 409", async () => {
      const trade = await createTrade({ status: "COMPLETED" });
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id));
      expect(res.status).toBe(409);
    });

    it("rejects a well-formed but nonexistent tradeId with 400, not 500", async () => {
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(UNKNOWN_ID, warehouse.id));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "tradeId" })]));
    });

    it("rejects a well-formed but nonexistent warehouseId with 400, not 500", async () => {
      const trade = await createTrade();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, UNKNOWN_ID));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "warehouseId" })]));
    });

    it("rejects missing/invalid required fields with field-level messages", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { transportMode: "SIDEWAYS", origin: undefined }));

      expect(res.status).toBe(400);
      const fields = res.body.fields.map((f: { field: string }) => f.field);
      expect(fields).toEqual(expect.arrayContaining(["transportMode", "origin"]));
    });

    it.each(["0.000", "-5.000"])("rejects quantityMt = %s with a field-level error (BR-5)", async (quantityMt) => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id, { quantityMt }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("rejects quantityMt sent as a JSON number instead of a string", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id, { quantityMt: 100 }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("rejects quantityMt with more than 3 decimal places", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "10.1234" }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("rejects quantityMt with more than 9 integer digits", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "1234567890.000" }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("rejects plannedArrivalDate before plannedDepartureDate", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { plannedDepartureDate: "2026-02-01", plannedArrivalDate: "2026-01-01" }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "plannedArrivalDate" })]),
      );
    });

    it.each(["origin", "destination"])("rejects an empty %s", async (field) => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { [field]: "" }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });

    it("ignores status/actualDepartureDate/actualArrivalDate sent in the body", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const res = await request(app).post("/api/shipments").send(
        shipmentBody(trade.id, warehouse.id, {
          status: "DELIVERED",
          actualDepartureDate: "2026-01-01",
          actualArrivalDate: "2026-01-02",
        }),
      );

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PLANNED");
      expect(res.body.actualDepartureDate).toBeNull();
      expect(res.body.actualArrivalDate).toBeNull();
    });

    it("round-trips quantityMt and planned dates exactly through create/get", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      const created = await request(app).post("/api/shipments").send(
        shipmentBody(trade.id, warehouse.id, {
          quantityMt: "12.345",
          plannedDepartureDate: "2026-03-01",
          plannedArrivalDate: "2026-03-15",
        }),
      );

      expect(created.status).toBe(201);
      expect(created.body.quantityMt).toBe("12.345");
      expect(created.body.plannedDepartureDate).toBe("2026-03-01");
      expect(created.body.plannedArrivalDate).toBe("2026-03-15");

      const fetched = await request(app).get(`/api/shipments/${created.body.id}`);
      expect(fetched.body.quantityMt).toBe("12.345");
      expect(fetched.body.plannedDepartureDate).toBe("2026-03-01");
      expect(fetched.body.plannedArrivalDate).toBe("2026-03-15");
    });
  });

  describe("BR-4a (shipment quantity vs trade quantity)", () => {
    it("a shipment quantity equal to the trade's full quantity succeeds", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "100.000" }));
      expect(res.status).toBe(201);
    });

    it("a shipment quantity exceeding the trade quantity is rejected on quantityMt", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();

      const res = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "150.000" }));
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("a second shipment pushing the running sum over the trade quantity is rejected, even though each alone would fit", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();

      const first = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "60.000" }));
      expect(first.status).toBe(201);

      const second = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "60.000" }));
      expect(second.status).toBe(400);
      expect(second.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("a second shipment landing exactly on the trade quantity succeeds (boundary)", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();

      await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id, { quantityMt: "60.000" }));
      const second = await request(app)
        .post("/api/shipments")
        .send(shipmentBody(trade.id, warehouse.id, { quantityMt: "40.000" }));
      expect(second.status).toBe(201);
    });
  });

  describe("read", () => {
    it("GET /api/shipments/:id returns the shipment, including derived commodityId/commodityName and warehouseName", async () => {
      const commodity = await createCommodity("Wheat");
      const trade = await createTrade({ commodityId: commodity.id });
      const warehouse = await createWarehouse("Rotterdam Silo");
      const created = await request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id));

      const res = await request(app).get(`/api/shipments/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.commodityId).toBe(commodity.id);
      expect(res.body.commodityName).toBe("Wheat");
      expect(res.body.warehouseName).toBe("Rotterdam Silo");
    });

    it("GET /api/shipments/:id with unknown id returns 404", async () => {
      const res = await request(app).get(`/api/shipments/${UNKNOWN_ID}`);
      expect(res.status).toBe(404);
    });

    it("GET /api/shipments/:id with malformed id returns 400", async () => {
      const res = await request(app).get("/api/shipments/not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("GET /api/shipments lists all shipments", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await createShipment(trade.id, warehouse.id, { quantityMt: "20.000" });

      const res = await request(app).get("/api/shipments");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    describe("filters", () => {
      it("filters by status", async () => {
        const trade = await createTrade();
        const warehouse = await createWarehouse();
        const planned = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
        const toDepart = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
        await request(app).post(`/api/shipments/${toDepart.id}/depart`);

        const res = await request(app).get("/api/shipments?status=PLANNED");
        expect(res.status).toBe(200);
        expect(res.body.map((s: { id: string }) => s.id)).toEqual([planned.id]);
      });

      it("filters by tradeId", async () => {
        const tradeA = await createTrade({ quantityMt: "500.000" });
        const tradeB = await createTrade({ quantityMt: "500.000" });
        const warehouse = await createWarehouse();
        const shipmentA = await createShipment(tradeA.id, warehouse.id, { quantityMt: "10.000" });
        await createShipment(tradeB.id, warehouse.id, { quantityMt: "10.000" });

        const res = await request(app).get(`/api/shipments?tradeId=${tradeA.id}`);
        expect(res.status).toBe(200);
        expect(res.body.map((s: { id: string }) => s.id)).toEqual([shipmentA.id]);
      });

      it("filters by warehouseId", async () => {
        const trade = await createTrade({ quantityMt: "500.000" });
        const warehouseA = await createWarehouse();
        const warehouseB = await createWarehouse();
        const shipmentA = await createShipment(trade.id, warehouseA.id, { quantityMt: "10.000" });
        await createShipment(trade.id, warehouseB.id, { quantityMt: "10.000" });

        const res = await request(app).get(`/api/shipments?warehouseId=${warehouseA.id}`);
        expect(res.status).toBe(200);
        expect(res.body.map((s: { id: string }) => s.id)).toEqual([shipmentA.id]);
      });
    });

    it("GET /api/trades/:id includes a shipments array", async () => {
      const trade = await createTrade({ quantityMt: "500.000" });
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).get(`/api/trades/${trade.id}`);
      expect(res.status).toBe(200);
      expect(res.body.shipments).toHaveLength(1);
      expect(res.body.shipments[0].id).toBe(shipment.id);
    });
  });

  describe("edit (PATCH /api/shipments/:id)", () => {
    it("succeeds while PLANNED, updating given fields", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ destination: "New Port" });
      expect(res.status).toBe(200);
      expect(res.body.destination).toBe("New Port");
    });

    it("is rejected once IN_TRANSIT", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${created.id}/depart`);

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ destination: "New Port" });
      expect(res.status).toBe(409);
    });

    it("is rejected once DELIVERED", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${created.id}/depart`);
      await request(app).post(`/api/shipments/${created.id}/deliver`);

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ destination: "New Port" });
      expect(res.status).toBe(409);
    });

    it("re-validates BR-4a: raising quantityMt past the trade's remaining allowance is rejected", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "60.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ quantityMt: "101.000" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]));
    });

    it("re-validates BR-4a excluding the shipment's own current quantity (raising within the trade's total succeeds)", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "60.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ quantityMt: "100.000" });
      expect(res.status).toBe(200);
      expect(res.body.quantityMt).toBe("100.000");
    });

    it("rejects quantityMt set to 0 (BR-5)", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ quantityMt: "0.000" });
      expect(res.status).toBe(400);
    });

    it("rejects changing only plannedArrivalDate to before the stored plannedDepartureDate, blaming the submitted field", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, {
        quantityMt: "10.000",
        plannedDepartureDate: "2026-01-10",
        plannedArrivalDate: "2026-01-20",
      });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ plannedArrivalDate: "2026-01-05" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "plannedArrivalDate" })]),
      );
    });

    it("rejects changing only plannedDepartureDate to after the stored plannedArrivalDate, blaming the submitted field", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, {
        quantityMt: "10.000",
        plannedDepartureDate: "2026-01-10",
        plannedArrivalDate: "2026-01-20",
      });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ plannedDepartureDate: "2026-01-25" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "plannedDepartureDate" })]),
      );
    });

    it("rejects a well-formed but nonexistent warehouseId", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({ warehouseId: UNKNOWN_ID });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "warehouseId" })]));
    });

    it("ignores tradeId, status, actualDepartureDate and actualArrivalDate in the body", async () => {
      const tradeA = await createTrade({ quantityMt: "500.000" });
      const tradeB = await createTrade({ quantityMt: "500.000" });
      const warehouse = await createWarehouse();
      const created = await createShipment(tradeA.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).patch(`/api/shipments/${created.id}`).send({
        tradeId: tradeB.id,
        status: "DELIVERED",
        actualDepartureDate: "2026-01-01",
        actualArrivalDate: "2026-01-02",
      });

      expect(res.status).toBe(200);
      expect(res.body.tradeId).toBe(tradeA.id);
      expect(res.body.status).toBe("PLANNED");
      expect(res.body.actualDepartureDate).toBeNull();
    });

    it("on an unknown id returns 404", async () => {
      const res = await request(app).patch(`/api/shipments/${UNKNOWN_ID}`).send({ destination: "X" });
      expect(res.status).toBe(404);
    });

    it("on a malformed id returns 400", async () => {
      const res = await request(app).patch("/api/shipments/not-a-uuid").send({ destination: "X" });
      expect(res.status).toBe(400);
    });
  });

  describe("delete (DELETE /api/shipments/:id)", () => {
    it("deletes a PLANNED shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).delete(`/api/shipments/${created.id}`);
      expect(res.status).toBe(204);

      const fetched = await request(app).get(`/api/shipments/${created.id}`);
      expect(fetched.status).toBe(404);
    });

    it("doesn't affect the trade's other shipments", async () => {
      const trade = await createTrade({ quantityMt: "500.000" });
      const warehouse = await createWarehouse();
      const toDelete = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      const toKeep = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      await request(app).delete(`/api/shipments/${toDelete.id}`);

      const fetched = await request(app).get(`/api/shipments/${toKeep.id}`);
      expect(fetched.status).toBe(200);
    });

    it("rejects deleting an IN_TRANSIT shipment with 409", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${created.id}/depart`);

      const res = await request(app).delete(`/api/shipments/${created.id}`);
      expect(res.status).toBe(409);
    });

    it("rejects deleting a DELIVERED shipment with 409", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${created.id}/depart`);
      await request(app).post(`/api/shipments/${created.id}/deliver`);

      const res = await request(app).delete(`/api/shipments/${created.id}`);
      expect(res.status).toBe(409);
    });

    it("on an unknown id returns 404", async () => {
      const res = await request(app).delete(`/api/shipments/${UNKNOWN_ID}`);
      expect(res.status).toBe(404);
    });

    it("on a malformed id returns 400", async () => {
      const res = await request(app).delete("/api/shipments/not-a-uuid");
      expect(res.status).toBe(400);
    });
  });

  describe("depart (POST /api/shipments/:id/depart)", () => {
    it("transitions PLANNED to IN_TRANSIT and defaults actualDepartureDate to today (local calendar date)", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).post(`/api/shipments/${created.id}/depart`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("IN_TRANSIT");
      expect(res.body.actualDepartureDate).toBe(localToday());
    });

    it("uses a supplied actualDepartureDate instead of today", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, {
        quantityMt: "10.000",
        plannedDepartureDate: "2020-01-01",
        plannedArrivalDate: "2020-01-05",
      });

      const res = await request(app).post(`/api/shipments/${created.id}/depart`).send({ actualDepartureDate: "2020-01-02" });
      expect(res.status).toBe(200);
      expect(res.body.actualDepartureDate).toBe("2020-01-02");
    });

    it("rejects a future actualDepartureDate", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const created = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).post(`/api/shipments/${created.id}/depart`).send({ actualDepartureDate: "2999-01-01" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "actualDepartureDate" })]),
      );
    });

    it("SELL shipment: decreases the origin warehouse's balance by exactly quantityMt, writes a matching movement, no other balance changes", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const otherWarehouse = await createWarehouse();
      const buyTrade = await createTrade({ direction: "BUY", quantityMt: "200.000", commodityId: commodity.id });
      const buyShipment = await createShipment(buyTrade.id, warehouse.id, { quantityMt: "200.000" });
      await request(app).post(`/api/shipments/${buyShipment.id}/depart`);
      await request(app).post(`/api/shipments/${buyShipment.id}/deliver`);

      const sellTrade = await createTrade({ direction: "SELL", quantityMt: "50.000", commodityId: commodity.id });
      const sellShipment = await createShipment(sellTrade.id, warehouse.id, { quantityMt: "50.000" });

      const res = await request(app).post(`/api/shipments/${sellShipment.id}/depart`);
      expect(res.status).toBe(200);

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("150.000");

      const otherBalance = await balanceOf(otherWarehouse.id, commodity.id);
      expect(otherBalance).toBeNull();

      const movements = await prisma.inventoryMovement.findMany({ where: { shipmentId: sellShipment.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantityMt.toFixed(3)).toBe("-50.000");
    });

    it("SELL shipment with insufficient stock is rejected 409, and nothing is mutated", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const sellTrade = await createTrade({ direction: "SELL", quantityMt: "50.000", commodityId: commodity.id });
      const sellShipment = await createShipment(sellTrade.id, warehouse.id, { quantityMt: "50.000" });

      const res = await request(app).post(`/api/shipments/${sellShipment.id}/depart`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("insufficient_stock");

      const fetched = await request(app).get(`/api/shipments/${sellShipment.id}`);
      expect(fetched.body.status).toBe("PLANNED");
      await expect(
        prisma.inventoryMovement.count({ where: { shipmentId: sellShipment.id } }),
      ).resolves.toBe(0);
    });

    it("BUY shipment departing writes no movement and changes no balance", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const buyTrade = await createTrade({ direction: "BUY", quantityMt: "50.000", commodityId: commodity.id });
      const shipment = await createShipment(buyTrade.id, warehouse.id, { quantityMt: "50.000" });

      const res = await request(app).post(`/api/shipments/${shipment.id}/depart`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("IN_TRANSIT");

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance).toBeNull();
      await expect(prisma.inventoryMovement.count({ where: { shipmentId: shipment.id } })).resolves.toBe(0);
    });

    it("rejects departing an already IN_TRANSIT shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/depart`);
      expect(res.status).toBe(409);
    });

    it("rejects departing a DELIVERED shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);
      await request(app).post(`/api/shipments/${shipment.id}/deliver`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/depart`);
      expect(res.status).toBe(409);
    });

    it("rejects departing when the parent trade isn't CONFIRMED — exercised by forcing the trade's status directly, since this is no longer reachable via the API alone now that BR-10 blocks cancelling a trade with any shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await prisma.trade.update({ where: { id: trade.id }, data: { status: "CANCELLED" } });

      const res = await request(app).post(`/api/shipments/${shipment.id}/depart`);
      expect(res.status).toBe(409);
    });
  });

  describe("deliver (POST /api/shipments/:id/deliver)", () => {
    it("transitions IN_TRANSIT to DELIVERED and defaults actualArrivalDate to today (local calendar date)", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DELIVERED");
      expect(res.body.actualArrivalDate).toBe(localToday());
    });

    it("uses a supplied actualArrivalDate instead of today", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`).send({ actualDepartureDate: "2020-01-01" });

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`).send({ actualArrivalDate: "2020-01-05" });
      expect(res.status).toBe(200);
      expect(res.body.actualArrivalDate).toBe("2020-01-05");
    });

    it("rejects a future actualArrivalDate", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`).send({ actualArrivalDate: "2999-01-01" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "actualArrivalDate" })]),
      );
    });

    it("rejects an actualArrivalDate before the shipment's actualDepartureDate", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`).send({ actualDepartureDate: "2020-01-10" });

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`).send({ actualArrivalDate: "2020-01-05" });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "actualArrivalDate" })]),
      );
    });

    it("BUY shipment: increases the destination warehouse's balance by exactly quantityMt, writes a matching movement, no other balance changes (AC-5, AC-6)", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const otherWarehouse = await createWarehouse();
      const trade = await createTrade({ direction: "BUY", quantityMt: "80.000", commodityId: commodity.id });
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "80.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`);
      expect(res.status).toBe(200);

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("80.000");

      const otherBalance = await balanceOf(otherWarehouse.id, commodity.id);
      expect(otherBalance).toBeNull();

      const movements = await prisma.inventoryMovement.findMany({ where: { shipmentId: shipment.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantityMt.toFixed(3)).toBe("80.000");
    });

    it("SELL shipment delivering writes no additional movement/balance change", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const buyTrade = await createTrade({ direction: "BUY", quantityMt: "100.000", commodityId: commodity.id });
      const buyShipment = await createShipment(buyTrade.id, warehouse.id, { quantityMt: "100.000" });
      await request(app).post(`/api/shipments/${buyShipment.id}/depart`);
      await request(app).post(`/api/shipments/${buyShipment.id}/deliver`);

      const sellTrade = await createTrade({ direction: "SELL", quantityMt: "30.000", commodityId: commodity.id });
      const sellShipment = await createShipment(sellTrade.id, warehouse.id, { quantityMt: "30.000" });
      await request(app).post(`/api/shipments/${sellShipment.id}/depart`);

      const balanceAfterDepart = await balanceOf(warehouse.id, commodity.id);
      expect(balanceAfterDepart?.quantityMt.toFixed(3)).toBe("70.000");

      const res = await request(app).post(`/api/shipments/${sellShipment.id}/deliver`);
      expect(res.status).toBe(200);

      const balanceAfterDeliver = await balanceOf(warehouse.id, commodity.id);
      expect(balanceAfterDeliver?.quantityMt.toFixed(3)).toBe("70.000");

      const movements = await prisma.inventoryMovement.findMany({ where: { shipmentId: sellShipment.id } });
      expect(movements).toHaveLength(1);
    });

    it("rejects delivering a PLANNED (not yet IN_TRANSIT) shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`);
      expect(res.status).toBe(409);
    });

    it("rejects delivering an already-DELIVERED shipment", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "10.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);
      await request(app).post(`/api/shipments/${shipment.id}/deliver`);

      const res = await request(app).post(`/api/shipments/${shipment.id}/deliver`);
      expect(res.status).toBe(409);
    });
  });

  describe("concurrency", () => {
    it("two concurrent deliver requests for the same IN_TRANSIT BUY shipment: exactly one succeeds, exactly one movement is written, the balance increases once, the other gets 409 not 500", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const trade = await createTrade({ direction: "BUY", quantityMt: "50.000", commodityId: commodity.id });
      const shipment = await createShipment(trade.id, warehouse.id, { quantityMt: "50.000" });
      await request(app).post(`/api/shipments/${shipment.id}/depart`);

      const [a, b] = await Promise.all([
        request(app).post(`/api/shipments/${shipment.id}/deliver`),
        request(app).post(`/api/shipments/${shipment.id}/deliver`),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);

      const movements = await prisma.inventoryMovement.findMany({ where: { shipmentId: shipment.id } });
      expect(movements).toHaveLength(1);

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("50.000");
    });

    it("two concurrent depart requests for the same PLANNED SELL shipment: exactly one succeeds, exactly one movement is written, the balance decreases once, the other gets 409 not 500", async () => {
      const commodity = await createCommodity();
      const warehouse = await createWarehouse();
      const buyTrade = await createTrade({ direction: "BUY", quantityMt: "100.000", commodityId: commodity.id });
      const buyShipment = await createShipment(buyTrade.id, warehouse.id, { quantityMt: "100.000" });
      await request(app).post(`/api/shipments/${buyShipment.id}/depart`);
      await request(app).post(`/api/shipments/${buyShipment.id}/deliver`);

      const sellTrade = await createTrade({ direction: "SELL", quantityMt: "40.000", commodityId: commodity.id });
      const sellShipment = await createShipment(sellTrade.id, warehouse.id, { quantityMt: "40.000" });

      const [a, b] = await Promise.all([
        request(app).post(`/api/shipments/${sellShipment.id}/depart`),
        request(app).post(`/api/shipments/${sellShipment.id}/depart`),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);

      const movements = await prisma.inventoryMovement.findMany({ where: { shipmentId: sellShipment.id } });
      expect(movements).toHaveLength(1);

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("60.000");
    });

    it("two concurrent shipment creations that each fit but together exceed the trade quantity: exactly one succeeds, and the sum never exceeds the trade quantity", async () => {
      const trade = await createTrade({ quantityMt: "100.000" });
      const warehouse = await createWarehouse();

      const [a, b] = await Promise.all([
        request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id, { quantityMt: "60.000" })),
        request(app).post("/api/shipments").send(shipmentBody(trade.id, warehouse.id, { quantityMt: "60.000" })),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 400]);

      const shipments = await prisma.shipment.findMany({ where: { tradeId: trade.id } });
      expect(shipments).toHaveLength(1);
      const sum = shipments.reduce((total, s) => total.plus(s.quantityMt), new Prisma.Decimal(0));
      expect(sum.lte(new Prisma.Decimal("100.000"))).toBe(true);
    });
  });

  describe("DB CHECK constraint backstops (same pattern as Phase 3a's inventory backstop tests)", () => {
    it("a direct insert with quantityMt <= 0 is rejected by the DB CHECK constraint, bypassing the service", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      await expect(
        prisma.shipment.create({
          data: {
            tradeId: trade.id,
            warehouseId: warehouse.id,
            quantityMt: "-5.000",
            transportMode: "TRUCK",
            origin: "Origin Port",
            destination: "Destination Port",
            plannedDepartureDate: new Date("2026-01-01"),
            plannedArrivalDate: new Date("2026-01-05"),
          },
        }),
      ).rejects.toThrow();

      await expect(prisma.shipment.count({ where: { tradeId: trade.id } })).resolves.toBe(0);
    });

    it("a direct insert with plannedArrivalDate before plannedDepartureDate is rejected by the DB CHECK constraint, bypassing the service", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      await expect(
        prisma.shipment.create({
          data: {
            tradeId: trade.id,
            warehouseId: warehouse.id,
            quantityMt: "10.000",
            transportMode: "TRUCK",
            origin: "Origin Port",
            destination: "Destination Port",
            plannedDepartureDate: new Date("2026-01-10"),
            plannedArrivalDate: new Date("2026-01-05"),
          },
        }),
      ).rejects.toThrow();

      await expect(prisma.shipment.count({ where: { tradeId: trade.id } })).resolves.toBe(0);
    });

    it("a direct insert with actualArrivalDate before actualDepartureDate is rejected by the DB CHECK constraint, bypassing the service", async () => {
      const trade = await createTrade();
      const warehouse = await createWarehouse();

      await expect(
        prisma.shipment.create({
          data: {
            tradeId: trade.id,
            warehouseId: warehouse.id,
            quantityMt: "10.000",
            transportMode: "TRUCK",
            origin: "Origin Port",
            destination: "Destination Port",
            plannedDepartureDate: new Date("2026-01-01"),
            plannedArrivalDate: new Date("2026-01-05"),
            status: "DELIVERED",
            actualDepartureDate: new Date("2026-01-10"),
            actualArrivalDate: new Date("2026-01-05"),
          },
        }),
      ).rejects.toThrow();

      await expect(prisma.shipment.count({ where: { tradeId: trade.id } })).resolves.toBe(0);
    });
  });

  describe("BR-8 (structural)", () => {
    it("Shipment has no stored commodityId column — it's always read from its trade", async () => {
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'Shipment'
      `;
      expect(columns.map((c) => c.column_name)).not.toContain("commodityId");
    });
  });

  describe("end-to-end flow", () => {
    it("confirms a 500 MT BUY trade delivered in two shipments, a 300 MT SELL trade departed and delivered, completes both trades, and the balance equals the sum of all movements", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const warehouse = await createWarehouse();

      const buyTradeRes = await request(app).post("/api/trades").send({
        commodityId: commodity.id,
        counterpartyId: counterparty.id,
        direction: "BUY",
        quantityMt: "500.000",
        price: "100.00",
        currency: "USD",
        deliveryPeriodStart: "2026-01-01",
        deliveryPeriodEnd: "2026-12-31",
      });
      expect(buyTradeRes.status).toBe(201);
      await request(app).post(`/api/trades/${buyTradeRes.body.id}/confirm`);

      const buyShipment1 = await createShipment(buyTradeRes.body.id, warehouse.id, { quantityMt: "300.000" });
      const buyShipment2 = await createShipment(buyTradeRes.body.id, warehouse.id, { quantityMt: "200.000" });

      for (const shipment of [buyShipment1, buyShipment2]) {
        await request(app).post(`/api/shipments/${shipment.id}/depart`);
        await request(app).post(`/api/shipments/${shipment.id}/deliver`);
      }

      let balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("500.000");

      const completeBuy = await request(app).post(`/api/trades/${buyTradeRes.body.id}/complete`);
      expect(completeBuy.status).toBe(200);
      expect(completeBuy.body.status).toBe("COMPLETED");

      const sellTradeRes = await request(app).post("/api/trades").send({
        commodityId: commodity.id,
        counterpartyId: counterparty.id,
        direction: "SELL",
        quantityMt: "300.000",
        price: "110.00",
        currency: "USD",
        deliveryPeriodStart: "2026-01-01",
        deliveryPeriodEnd: "2026-12-31",
      });
      expect(sellTradeRes.status).toBe(201);
      await request(app).post(`/api/trades/${sellTradeRes.body.id}/confirm`);

      const sellShipment = await createShipment(sellTradeRes.body.id, warehouse.id, { quantityMt: "300.000" });
      const departRes = await request(app).post(`/api/shipments/${sellShipment.id}/depart`);
      expect(departRes.status).toBe(200);

      balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("200.000");

      const deliverRes = await request(app).post(`/api/shipments/${sellShipment.id}/deliver`);
      expect(deliverRes.status).toBe(200);

      const completeSell = await request(app).post(`/api/trades/${sellTradeRes.body.id}/complete`);
      expect(completeSell.status).toBe(200);
      expect(completeSell.body.status).toBe("COMPLETED");

      const movements = await prisma.inventoryMovement.findMany({
        where: { warehouseId: warehouse.id, commodityId: commodity.id },
      });
      const movementSum = movements.reduce((total, m) => total.plus(m.quantityMt), new Prisma.Decimal(0));

      const finalBalance = await balanceOf(warehouse.id, commodity.id);
      expect(finalBalance?.quantityMt.toFixed(3)).toBe(movementSum.toFixed(3));
      expect(finalBalance?.quantityMt.toFixed(3)).toBe("200.000");
    });
  });
});

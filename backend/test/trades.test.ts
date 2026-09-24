import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

async function createCommodity(name = `Wheat-${randomUUID()}`) {
  return prisma.commodity.create({
    data: { name, category: "GRAIN", unit: "MT" },
  });
}

async function createCounterparty(name = `Trader-${randomUUID()}`) {
  return prisma.counterparty.create({ data: { name, type: "BOTH" } });
}

function validTradeBody(overrides: Record<string, unknown> = {}) {
  return {
    direction: "BUY",
    quantityMt: "100.000",
    price: "250.50",
    currency: "USD",
    deliveryPeriodStart: "2026-01-01",
    deliveryPeriodEnd: "2026-01-31",
    ...overrides,
  };
}

describe("trades", () => {
  describe("create (POST /api/trades)", () => {
    it("creates a trade with valid fields and returns 201 with status DRAFT", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
          }),
        );

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      expect(res.body.commodityId).toBe(commodity.id);
      expect(res.body.counterpartyId).toBe(counterparty.id);
    });

    it("ignores a status field in the request body — new trades always start DRAFT", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            status: "CONFIRMED",
          }),
        );

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
    });

    it.each([0, -5])("rejects quantityMt = %d with a field-level error", async (quantityMt) => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            quantityMt,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
      );
    });

    it.each([0, -5])("rejects price = %d with a field-level error", async (price) => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            price,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "price" })]),
      );
    });

    it("rejects deliveryPeriodEnd before deliveryPeriodStart with a field-level error", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            deliveryPeriodStart: "2026-02-01",
            deliveryPeriodEnd: "2026-01-01",
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "deliveryPeriodEnd" })]),
      );
    });

    it("rejects missing or invalid required fields with field-level messages", async () => {
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            // commodityId omitted
            counterpartyId: counterparty.id,
            direction: "SIDEWAYS",
            currency: "BTC",
          }),
        );

      expect(res.status).toBe(400);
      const fields = res.body.fields.map((f: { field: string }) => f.field);
      expect(fields).toEqual(expect.arrayContaining(["commodityId", "direction", "currency"]));
    });

    it("rejects a well-formed but nonexistent commodityId with 400, not 500", async () => {
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: UNKNOWN_ID,
            counterpartyId: counterparty.id,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "commodityId" })]),
      );
    });

    it("rejects quantityMt sent as a JSON number instead of a string", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            quantityMt: 100,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
      );
      await expect(prisma.trade.count()).resolves.toBe(0);
    });

    it("rejects price sent as a JSON number instead of a string", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            price: 250.5,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "price" })]),
      );
      await expect(prisma.trade.count()).resolves.toBe(0);
    });

    it("rejects a well-formed but nonexistent counterpartyId with 400, not 500", async () => {
      const commodity = await createCommodity();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: UNKNOWN_ID,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "counterpartyId" })]),
      );
    });
  });

  describe("decimal precision (BR-1)", () => {
    it("round-trips a fractional quantityMt exactly through create and get, and returns it as an exact string", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const created = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            quantityMt: "12.345",
          }),
        );

      expect(created.status).toBe(201);
      expect(created.body.quantityMt).toBe("12.345");

      const fetched = await request(app).get(`/api/trades/${created.body.id}`);
      expect(fetched.body.quantityMt).toBe("12.345");
    });

    it("round-trips a fractional price exactly through create and get, and returns it as an exact string", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const created = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            price: "245.67",
          }),
        );

      expect(created.status).toBe(201);
      expect(created.body.price).toBe("245.67");
      expect(typeof created.body.price).toBe("string");
      expect(typeof created.body.quantityMt).toBe("string");

      const fetched = await request(app).get(`/api/trades/${created.body.id}`);
      expect(fetched.body.price).toBe("245.67");
    });

    it("rejects quantityMt with more than 3 decimal places, without rounding", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            quantityMt: "12.3456",
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
      );
      await expect(prisma.trade.count()).resolves.toBe(0);
    });

    it("rejects price with more than 2 decimal places, without rounding", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const res = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            price: "12.345",
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "price" })]),
      );
      await expect(prisma.trade.count()).resolves.toBe(0);
    });

    it("returns deliveryPeriodStart and deliveryPeriodEnd as \"YYYY-MM-DD\" strings, not full timestamps", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();

      const created = await request(app)
        .post("/api/trades")
        .send(
          validTradeBody({
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            deliveryPeriodStart: "2026-03-01",
            deliveryPeriodEnd: "2026-03-15",
          }),
        );

      expect(created.status).toBe(201);
      expect(created.body.deliveryPeriodStart).toBe("2026-03-01");
      expect(created.body.deliveryPeriodEnd).toBe("2026-03-15");

      const fetched = await request(app).get(`/api/trades/${created.body.id}`);
      expect(fetched.body.deliveryPeriodStart).toBe("2026-03-01");
      expect(fetched.body.deliveryPeriodEnd).toBe("2026-03-15");
    });
  });

  describe("read (GET /api/trades, GET /api/trades/:id)", () => {
    it("GET /api/trades/:id returns the matching trade", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const trade = await prisma.trade.create({
        data: {
          commodityId: commodity.id,
          counterpartyId: counterparty.id,
          direction: "BUY",
          quantityMt: "10.000",
          price: "100.00",
          currency: "USD",
          deliveryPeriodStart: new Date("2026-01-01"),
          deliveryPeriodEnd: new Date("2026-01-31"),
        },
      });

      const res = await request(app).get(`/api/trades/${trade.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(trade.id);
    });

    it("GET /api/trades/:id with a well-formed but unknown id returns 404", async () => {
      const res = await request(app).get(`/api/trades/${UNKNOWN_ID}`);
      expect(res.status).toBe(404);
    });

    it("GET /api/trades/:id with a malformed id returns 400", async () => {
      const res = await request(app).get("/api/trades/not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("GET /api/trades lists all trades", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      await prisma.trade.createMany({
        data: [
          {
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            direction: "BUY",
            quantityMt: "10.000",
            price: "100.00",
            currency: "USD",
            deliveryPeriodStart: new Date("2026-01-01"),
            deliveryPeriodEnd: new Date("2026-01-31"),
          },
          {
            commodityId: commodity.id,
            counterpartyId: counterparty.id,
            direction: "SELL",
            quantityMt: "20.000",
            price: "200.00",
            currency: "EUR",
            deliveryPeriodStart: new Date("2026-02-01"),
            deliveryPeriodEnd: new Date("2026-02-28"),
          },
        ],
      });

      const res = await request(app).get("/api/trades");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    describe("filters", () => {
      let wheat: { id: string };
      let coffee: { id: string };
      let counterparty: { id: string };
      let draftTradeId: string;
      let confirmedTradeId: string;
      let cancelledTradeId: string;

      beforeEach(async () => {
        wheat = await createCommodity("Wheat");
        coffee = await createCommodity("Coffee");
        counterparty = await createCounterparty();

        const draft = await request(app)
          .post("/api/trades")
          .send(
            validTradeBody({
              commodityId: wheat.id,
              counterpartyId: counterparty.id,
              direction: "BUY",
            }),
          );
        draftTradeId = draft.body.id;

        const toConfirm = await request(app)
          .post("/api/trades")
          .send(
            validTradeBody({
              commodityId: coffee.id,
              counterpartyId: counterparty.id,
              direction: "SELL",
            }),
          );
        await request(app).post(`/api/trades/${toConfirm.body.id}/confirm`);
        confirmedTradeId = toConfirm.body.id;

        const toCancel = await request(app)
          .post("/api/trades")
          .send(
            validTradeBody({
              commodityId: wheat.id,
              counterpartyId: counterparty.id,
              direction: "SELL",
            }),
          );
        await request(app).post(`/api/trades/${toCancel.body.id}/cancel`);
        cancelledTradeId = toCancel.body.id;
      });

      it("filters by status", async () => {
        const res = await request(app).get("/api/trades?status=CONFIRMED");
        expect(res.status).toBe(200);
        expect(res.body.map((t: { id: string }) => t.id)).toEqual([confirmedTradeId]);
      });

      it("filters by commodityId", async () => {
        const res = await request(app).get(`/api/trades?commodityId=${wheat.id}`);
        expect(res.status).toBe(200);
        expect(res.body.map((t: { id: string }) => t.id).sort()).toEqual(
          [draftTradeId, cancelledTradeId].sort(),
        );
      });

      it("filters by direction", async () => {
        const res = await request(app).get("/api/trades?direction=SELL");
        expect(res.status).toBe(200);
        expect(res.body.map((t: { id: string }) => t.id).sort()).toEqual(
          [confirmedTradeId, cancelledTradeId].sort(),
        );
      });
    });
  });

  describe("edit (PATCH /api/trades/:id)", () => {
    it("succeeds while DRAFT, updating the given fields", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ price: "300.00" });

      expect(res.status).toBe(200);
      expect(res.body.price).toBe("300.00");
    });

    it("re-validates a changed field (quantityMt set to 0 is rejected)", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ quantityMt: 0 });

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
      );
    });

    it("is rejected once the trade is CONFIRMED", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/confirm`);

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ price: "300.00" });

      expect(res.status).toBe(409);
    });

    it("is rejected once the trade is CANCELLED", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/cancel`);

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ price: "300.00" });

      expect(res.status).toBe(409);
    });

    it("ignores a status field — status can only change via confirm/cancel", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ status: "CONFIRMED", price: "300.00" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DRAFT");
      expect(res.body.price).toBe("300.00");
    });

    it("rejects a well-formed but nonexistent commodityId with 400, not 500", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ commodityId: UNKNOWN_ID });

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "commodityId" })]),
      );
    });

    it("rejects a well-formed but nonexistent counterpartyId with 400, not 500", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ counterpartyId: UNKNOWN_ID });

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "counterpartyId" })]),
      );
    });

    it("rejects changing only deliveryPeriodEnd to before the stored deliveryPeriodStart", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app).post("/api/trades").send(
        validTradeBody({
          commodityId: commodity.id,
          counterpartyId: counterparty.id,
          deliveryPeriodStart: "2026-01-10",
          deliveryPeriodEnd: "2026-01-20",
        }),
      );

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ deliveryPeriodEnd: "2026-01-05" });

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "deliveryPeriodEnd" })]),
      );
    });

    it("rejects changing only deliveryPeriodStart to after the stored deliveryPeriodEnd", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app).post("/api/trades").send(
        validTradeBody({
          commodityId: commodity.id,
          counterpartyId: counterparty.id,
          deliveryPeriodStart: "2026-01-10",
          deliveryPeriodEnd: "2026-01-20",
        }),
      );

      const res = await request(app)
        .patch(`/api/trades/${created.body.id}`)
        .send({ deliveryPeriodStart: "2026-01-25" });

      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "deliveryPeriodStart" })]),
      );
    });

    it("on an unknown id returns 404", async () => {
      const res = await request(app)
        .patch(`/api/trades/${UNKNOWN_ID}`)
        .send({ price: "300.00" });
      expect(res.status).toBe(404);
    });

    it("on a malformed id returns 400", async () => {
      const res = await request(app).patch("/api/trades/not-a-uuid").send({ price: "300.00" });
      expect(res.status).toBe(400);
    });
  });

  describe("confirm (POST /api/trades/:id/confirm)", () => {
    it("transitions a DRAFT trade to CONFIRMED", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app).post(`/api/trades/${created.body.id}/confirm`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CONFIRMED");
    });

    it("returns 404 for a nonexistent trade id", async () => {
      const res = await request(app).post(`/api/trades/${UNKNOWN_ID}/confirm`);
      expect(res.status).toBe(404);
    });
  });

  describe("cancel (POST /api/trades/:id/cancel)", () => {
    it("transitions a DRAFT trade to CANCELLED", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));

      const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("transitions a CONFIRMED trade (with no shipments) to CANCELLED", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/confirm`);

      const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("returns 404 for a nonexistent trade id", async () => {
      const res = await request(app).post(`/api/trades/${UNKNOWN_ID}/cancel`);
      expect(res.status).toBe(404);
    });
  });

  describe("invalid transitions (BR-7)", () => {
    it("rejects confirming an already-CONFIRMED trade with 409 naming both statuses", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/confirm`);

      const res = await request(app).post(`/api/trades/${created.body.id}/confirm`);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Cannot transition trade from CONFIRMED to CONFIRMED");
    });

    it("rejects confirming a CANCELLED trade with 409 naming both statuses", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/cancel`);

      const res = await request(app).post(`/api/trades/${created.body.id}/confirm`);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Cannot transition trade from CANCELLED to CONFIRMED");
    });

    it("rejects cancelling an already-CANCELLED trade with 409 naming both statuses", async () => {
      const commodity = await createCommodity();
      const counterparty = await createCounterparty();
      const created = await request(app)
        .post("/api/trades")
        .send(validTradeBody({ commodityId: commodity.id, counterpartyId: counterparty.id }));
      await request(app).post(`/api/trades/${created.body.id}/cancel`);

      const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Cannot transition trade from CANCELLED to CANCELLED");
    });
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { recordMovement } from "../src/modules/inventory/service.js";

async function createCommodity(name = `Wheat-${randomUUID()}`) {
  return prisma.commodity.create({ data: { name, category: "GRAIN", unit: "MT" } });
}

async function createWarehouse(name = `Warehouse-${randomUUID()}`) {
  return prisma.warehouse.create({ data: { name, location: "Rotterdam" } });
}

function balanceOf(warehouseId: string, commodityId: string) {
  return prisma.inventoryBalance.findUnique({
    where: { warehouseId_commodityId: { warehouseId, commodityId } },
  });
}

describe("inventory service (recordMovement)", () => {
  describe("recording movements", () => {
    it("a positive quantityMt creates a movement row and increases the balance", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "25.500",
      });

      expect(result.ok).toBe(true);
      await expect(prisma.inventoryMovement.count()).resolves.toBe(1);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("25.500");
    });

    it("a negative quantityMt decreases the balance when sufficient stock exists", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "50.000",
      });

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "-20.000",
      });

      expect(result.ok).toBe(true);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("30.000");
    });

    it("the first movement for a warehouse+commodity pair creates the balance row", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "10.000",
      });

      await expect(prisma.inventoryBalance.count()).resolves.toBe(1);
    });

    it("a subsequent movement for the same pair updates the existing balance row rather than creating a duplicate", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "10.000",
      });

      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "5.000",
      });

      await expect(prisma.inventoryBalance.count()).resolves.toBe(1);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("15.000");
    });

    it("a movement for one warehouse+commodity pair doesn't change any other pair's balance", async () => {
      const warehouseA = await createWarehouse();
      const warehouseB = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouseB.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "100.000",
      });

      await recordMovement({
        warehouseId: warehouseA.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "5.000",
      });

      const balanceB = await balanceOf(warehouseB.id, commodity.id);
      expect(balanceB?.quantityMt.toFixed(3)).toBe("100.000");
    });

    it("after a sequence of mixed movements, the balance equals the sum of all movements for that pair", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      const amounts = ["50.000", "-10.000", "25.500", "-5.250", "1.000"];

      for (const quantityMt of amounts) {
        const result = await recordMovement({
          warehouseId: warehouse.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt,
        });
        expect(result.ok).toBe(true);
      }

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("61.250");
    });
  });

  describe("never-negative guard", () => {
    it("rejects a negative quantityMt that would take the balance below zero, before writing anything", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "10.000",
      });

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "-15.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.body.error).toBe("insufficient_stock");
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(1);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("10.000");
    });

    it("rejects removing stock from a pair that never had any, with nothing written", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "-1.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.body.error).toBe("insufficient_stock");
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });

    it("removing stock down to exactly zero succeeds", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "20.000",
      });

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "-20.000",
      });

      expect(result.ok).toBe(true);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("0.000");
    });

    it("a direct write bypassing recordMovement is still rejected by the DB CHECK constraint", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      await expect(
        prisma.inventoryBalance.create({
          data: { warehouseId: warehouse.id, commodityId: commodity.id, quantityMt: "-5.000" },
        }),
      ).rejects.toThrow();

      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });

    it("under two concurrent removals that together exceed stock, exactly one succeeds, the final balance is exactly 40.000, and the other gets the insufficient-stock error, not a 500", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "90.000",
      });

      const [a, b] = await Promise.all([
        recordMovement({
          warehouseId: warehouse.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "-50.000",
        }),
        recordMovement({
          warehouseId: warehouse.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "-50.000",
        }),
      ]);

      const outcomes = [a, b];
      const succeeded = outcomes.filter((r) => r.ok);
      const failed = outcomes.filter((r) => !r.ok);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      if (!failed[0].ok) {
        expect(failed[0].status).toBe(409);
        expect(failed[0].body.error).toBe("insufficient_stock");
      }

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("40.000");
    });

    it("two concurrent additions to a warehouse+commodity with no existing balance both succeed, and the balance equals their sum", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const [a, b] = await Promise.all([
        recordMovement({
          warehouseId: warehouse.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "30.000",
        }),
        recordMovement({
          warehouseId: warehouse.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "20.000",
        }),
      ]);

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(1);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("50.000");
    });
  });

  describe("decimal precision (BR-1)", () => {
    it("round-trips a fractional quantityMt exactly on the created movement", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "50.500",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.movement.quantityMt.toFixed(3)).toBe("50.500");
      }
    });

    it("round-trips a fractional quantityMt exactly on the resulting balance", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "50.500",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.balance.quantityMt.toFixed(3)).toBe("50.500");
      }
    });

    it("rejects a quantityMt with more than 3 decimal places, without rounding, and persists nothing", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "10.1234",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });

    it("rejects a quantityMt with more than 9 integer digits, without truncating, and persists nothing", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        // DECIMAL(12,3) allows at most 9 digits before the point; this has 10.
        quantityMt: "1234567890.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
        );
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });

    it("adding 0.100 and 0.200 gives exactly 0.300, not a binary-float rounding artifact", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "0.100",
      });

      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "0.200",
      });

      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("0.300");
    });

    it("rejects quantityMt sent as a JS number instead of a string", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        // Intentionally wrong type to prove the runtime check catches it
        // even though the TS signature says string.
        quantityMt: 10 as unknown as string,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
        );
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
    });

    it("rejects a zero quantityMt", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "0.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "quantityMt" })]),
        );
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
    });
  });

  describe("shipmentId uniqueness", () => {
    it("rejects a second movement for the same shipmentId, and nothing changes", async () => {
      const warehouse = await createWarehouse();
      const commodity = await createCommodity();
      const shipmentId = randomUUID();
      await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId,
        quantityMt: "10.000",
      });

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: commodity.id,
        shipmentId,
        quantityMt: "5.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.body.error).toBe("duplicate_movement");
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(1);
      const balance = await balanceOf(warehouse.id, commodity.id);
      expect(balance?.quantityMt.toFixed(3)).toBe("10.000");
    });
  });

  describe("warehouseId/commodityId existence", () => {
    it("rejects a well-formed but nonexistent warehouseId, with nothing written", async () => {
      const commodity = await createCommodity();

      const result = await recordMovement({
        warehouseId: randomUUID(),
        commodityId: commodity.id,
        shipmentId: randomUUID(),
        quantityMt: "10.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "warehouseId" })]),
        );
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });

    it("rejects a well-formed but nonexistent commodityId, with nothing written", async () => {
      const warehouse = await createWarehouse();

      const result = await recordMovement({
        warehouseId: warehouse.id,
        commodityId: randomUUID(),
        shipmentId: randomUUID(),
        quantityMt: "10.000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.fields).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: "commodityId" })]),
        );
      }
      await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
    });
  });
});

describe("inventory read endpoints", () => {
  describe("GET /api/inventory", () => {
    it("returns an empty array when there is no balance data", async () => {
      const res = await request(app).get("/api/inventory");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns current balance rows, including warehouse and commodity names", async () => {
      const warehouse = await createWarehouse("Rotterdam Silo 1");
      const commodity = await createCommodity("Wheat");
      await prisma.inventoryBalance.create({
        data: { warehouseId: warehouse.id, commodityId: commodity.id, quantityMt: "12.345" },
      });

      const res = await request(app).get("/api/inventory");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        warehouseId: warehouse.id,
        warehouseName: "Rotterdam Silo 1",
        commodityId: commodity.id,
        commodityName: "Wheat",
        quantityMt: "12.345",
      });
    });
  });

  describe("GET /api/inventory/movements", () => {
    it("returns an empty array when there is no movement data", async () => {
      const res = await request(app).get("/api/inventory/movements");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns ledger rows and supports filtering by warehouseId and commodityId", async () => {
      const warehouseA = await createWarehouse();
      const warehouseB = await createWarehouse();
      const commodity = await createCommodity();
      const movementA = await prisma.inventoryMovement.create({
        data: {
          warehouseId: warehouseA.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "10.000",
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          warehouseId: warehouseB.id,
          commodityId: commodity.id,
          shipmentId: randomUUID(),
          quantityMt: "20.000",
        },
      });

      const all = await request(app).get("/api/inventory/movements");
      expect(all.status).toBe(200);
      expect(all.body).toHaveLength(2);

      const filtered = await request(app).get(`/api/inventory/movements?warehouseId=${warehouseA.id}`);
      expect(filtered.status).toBe(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0].id).toBe(movementA.id);
    });

    it("rejects a malformed warehouseId filter with 400", async () => {
      const res = await request(app).get("/api/inventory/movements?warehouseId=not-a-uuid");
      expect(res.status).toBe(400);
    });
  });
});

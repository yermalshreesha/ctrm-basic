import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

describe("commodities (fixed reference data — BR-9)", () => {
  it("GET /api/commodities returns the seeded commodities", async () => {
    await prisma.commodity.create({
      data: { name: "Wheat", category: "GRAIN", unit: "MT" },
    });
    await prisma.commodity.create({
      data: { name: "Arabica Coffee", category: "COFFEE", unit: "MT" },
    });

    const res = await request(app).get("/api/commodities");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Wheat",
          category: "GRAIN",
          unit: "MT",
        }),
        expect.objectContaining({
          name: "Arabica Coffee",
          category: "COFFEE",
          unit: "MT",
        }),
      ]),
    );
  });

  it("POST /api/commodities is rejected — no create endpoint exists", async () => {
    const res = await request(app)
      .post("/api/commodities")
      .send({ name: "Sugar ICUMSA 45", category: "SUGAR", unit: "MT" });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/commodities/:id is rejected — no edit endpoint exists", async () => {
    const commodity = await prisma.commodity.create({
      data: { name: "Wheat", category: "GRAIN", unit: "MT" },
    });

    const res = await request(app)
      .patch(`/api/commodities/${commodity.id}`)
      .send({ name: "Durum Wheat" });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/commodities/:id is rejected — no delete endpoint exists", async () => {
    const commodity = await prisma.commodity.create({
      data: { name: "Wheat", category: "GRAIN", unit: "MT" },
    });

    const res = await request(app).delete(`/api/commodities/${commodity.id}`);

    expect(res.status).toBe(404);
  });
});

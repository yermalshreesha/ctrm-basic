import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

describe("counterparties (fixed reference data — BR-9)", () => {
  it("GET /api/counterparties returns the seeded counterparties", async () => {
    await prisma.counterparty.create({
      data: { name: "Acme Grain Traders", type: "BUYER" },
    });
    await prisma.counterparty.create({
      data: { name: "Global Commodities Ltd", type: "SELLER" },
    });

    const res = await request(app).get("/api/counterparties");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Acme Grain Traders", type: "BUYER" }),
        expect.objectContaining({
          name: "Global Commodities Ltd",
          type: "SELLER",
        }),
      ]),
    );
  });

  it("GET /api/counterparties/:id returns the matching counterparty", async () => {
    const counterparty = await prisma.counterparty.create({
      data: { name: "Continental Agri SA", type: "BOTH" },
    });

    const res = await request(app).get(
      `/api/counterparties/${counterparty.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: counterparty.id,
      name: "Continental Agri SA",
      type: "BOTH",
    });
  });

  it("GET /api/counterparties/:id with a well-formed but unknown id returns 404", async () => {
    const res = await request(app).get(
      "/api/counterparties/00000000-0000-0000-0000-000000000000",
    );

    expect(res.status).toBe(404);
  });

  it("GET /api/counterparties/:id with a malformed id returns 400", async () => {
    const res = await request(app).get("/api/counterparties/not-a-uuid");

    expect(res.status).toBe(400);
  });

  it("POST /api/counterparties is rejected — no create endpoint exists", async () => {
    const res = await request(app)
      .post("/api/counterparties")
      .send({ name: "Northwind Exports", type: "SELLER" });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/counterparties/:id is rejected — no edit endpoint exists", async () => {
    const counterparty = await prisma.counterparty.create({
      data: { name: "Acme Grain Traders", type: "BUYER" },
    });

    const res = await request(app)
      .patch(`/api/counterparties/${counterparty.id}`)
      .send({ type: "BOTH" });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/counterparties/:id is rejected — no delete endpoint exists", async () => {
    const counterparty = await prisma.counterparty.create({
      data: { name: "Acme Grain Traders", type: "BUYER" },
    });

    const res = await request(app).delete(
      `/api/counterparties/${counterparty.id}`,
    );

    expect(res.status).toBe(404);
  });

  it("rejects a duplicate counterparty name at the database level", async () => {
    await prisma.counterparty.create({
      data: { name: "Acme Grain Traders", type: "BUYER" },
    });

    await expect(
      prisma.counterparty.create({
        data: { name: "Acme Grain Traders", type: "SELLER" },
      }),
    ).rejects.toThrow();
  });
});

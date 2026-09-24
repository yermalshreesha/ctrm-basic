import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

describe("warehouses (fixed reference data — BR-9)", () => {
  it("GET /api/warehouses returns the seeded warehouses", async () => {
    await prisma.warehouse.create({
      data: { name: "Rotterdam Terminal", location: "Rotterdam, Netherlands" },
    });
    await prisma.warehouse.create({
      data: { name: "Santos Port Warehouse", location: "Santos, Brazil" },
    });

    const res = await request(app).get("/api/warehouses");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Rotterdam Terminal",
          location: "Rotterdam, Netherlands",
        }),
        expect.objectContaining({
          name: "Santos Port Warehouse",
          location: "Santos, Brazil",
        }),
      ]),
    );
  });

  it("GET /api/warehouses/:id returns the matching warehouse", async () => {
    const warehouse = await prisma.warehouse.create({
      data: { name: "Houston Grain Elevator", location: "Houston, TX, USA" },
    });

    const res = await request(app).get(`/api/warehouses/${warehouse.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: warehouse.id,
      name: "Houston Grain Elevator",
      location: "Houston, TX, USA",
    });
  });

  it("GET /api/warehouses/:id with a well-formed but unknown id returns 404", async () => {
    const res = await request(app).get(
      "/api/warehouses/00000000-0000-0000-0000-000000000000",
    );

    expect(res.status).toBe(404);
  });

  it("GET /api/warehouses/:id with a malformed id returns 400", async () => {
    const res = await request(app).get("/api/warehouses/not-a-uuid");

    expect(res.status).toBe(400);
  });

  it("POST /api/warehouses is rejected — no create endpoint exists", async () => {
    const res = await request(app)
      .post("/api/warehouses")
      .send({ name: "Mombasa Bonded Warehouse", location: "Mombasa, Kenya" });

    expect(res.status).toBe(404);
  });

  it("PATCH /api/warehouses/:id is rejected — no edit endpoint exists", async () => {
    const warehouse = await prisma.warehouse.create({
      data: { name: "Rotterdam Terminal", location: "Rotterdam, Netherlands" },
    });

    const res = await request(app)
      .patch(`/api/warehouses/${warehouse.id}`)
      .send({ location: "Amsterdam, Netherlands" });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/warehouses/:id is rejected — no delete endpoint exists", async () => {
    const warehouse = await prisma.warehouse.create({
      data: { name: "Rotterdam Terminal", location: "Rotterdam, Netherlands" },
    });

    const res = await request(app).delete(`/api/warehouses/${warehouse.id}`);

    expect(res.status).toBe(404);
  });

  it("rejects a duplicate warehouse name at the database level", async () => {
    await prisma.warehouse.create({
      data: { name: "Rotterdam Terminal", location: "Rotterdam, Netherlands" },
    });

    await expect(
      prisma.warehouse.create({
        data: { name: "Rotterdam Terminal", location: "Different location" },
      }),
    ).rejects.toThrow();
  });
});

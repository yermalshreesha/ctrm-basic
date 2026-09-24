import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns 200 and confirms the database connection", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });
});

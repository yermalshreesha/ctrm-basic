import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

describe("global error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a generic 500 with no internal details when a route handler throws unexpectedly", async () => {
    vi.spyOn(prisma.trade, "findMany").mockRejectedValue(
      new Error("secret internal failure detail: connection string leaked here"),
    );

    const res = await request(app).get("/api/trades");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error", message: "An unexpected error occurred" });
    expect(JSON.stringify(res.body)).not.toContain("secret internal failure detail");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  afterEach(() => {
    delete process.env.RENDER_GIT_COMMIT;
  });

  it("returns 200, confirms the database connection, and reports commit as unknown locally", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected", commit: "unknown" });
  });

  it("reports Render's RENDER_GIT_COMMIT as the commit when it's set", async () => {
    process.env.RENDER_GIT_COMMIT = "abc1234";

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.commit).toBe("abc1234");
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
const indexHtmlPath = path.join(frontendDist, "index.html");
const appJsPath = path.join(frontendDist, "assets", "app.js");

const indexHtmlContent = "<!doctype html><title>CTRM fixture</title>";
const appJsContent = "console.log('ctrm fixture asset');";

describe("production static serving", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: Express;

  beforeAll(async () => {
    fs.mkdirSync(path.dirname(appJsPath), { recursive: true });
    fs.writeFileSync(indexHtmlPath, indexHtmlContent);
    fs.writeFileSync(appJsPath, appJsContent);
    process.env.NODE_ENV = "production";
    vi.resetModules();
    ({ app } = await import("../src/app.js"));
  });

  afterAll(() => {
    fs.rmSync(frontendDist, { recursive: true, force: true });
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("serves the built index.html for GET /", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.text).toBe(indexHtmlContent);
  });

  it("serves index.html for a client-side route (SPA fallback)", async () => {
    const res = await request(app).get("/trades/abc");

    expect(res.status).toBe(200);
    expect(res.text).toBe(indexHtmlContent);
  });

  it("serves a real static asset as itself, not index.html", async () => {
    const res = await request(app).get("/assets/app.js");

    expect(res.status).toBe(200);
    expect(res.text).toBe(appJsContent);
  });

  it("does not hijack an unmatched /api route with the SPA fallback", async () => {
    const res = await request(app).get("/api/unknown-route");

    expect(res.status).toBe(404);
    expect(res.text).not.toBe(indexHtmlContent);
  });

  it("still returns a real API route's normal JSON response", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "connected" });
  });
});

describe("static serving outside production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: Express;

  beforeAll(async () => {
    fs.mkdirSync(frontendDist, { recursive: true });
    fs.writeFileSync(indexHtmlPath, indexHtmlContent);
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
    ({ app } = await import("../src/app.js"));
  });

  afterAll(() => {
    fs.rmSync(frontendDist, { recursive: true, force: true });
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("does not serve the built frontend when NODE_ENV is not production", async () => {
    const res = await request(app).get("/");

    expect(res.text).not.toBe(indexHtmlContent);
  });
});

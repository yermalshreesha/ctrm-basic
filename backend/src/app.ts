import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { prisma } from "./db.js";
import { commoditiesRouter } from "./modules/commodities/routes.js";
import { counterpartiesRouter } from "./modules/counterparties/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { inventoryRouter } from "./modules/inventory/routes.js";
import { shipmentsRouter } from "./modules/shipments/routes.js";
import { tradesRouter } from "./modules/trades/routes.js";
import { warehousesRouter } from "./modules/warehouses/routes.js";
import { errorHandler } from "./shared/errorHandler.js";

export const app = express();

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      db: "connected",
      commit: process.env.RENDER_GIT_COMMIT ?? "unknown",
    });
  } catch {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/commodities", commoditiesRouter);
app.use("/api/counterparties", counterpartiesRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/trades", tradesRouter);
app.use("/api/shipments", shipmentsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/dashboard", dashboardRouter);

// Production only — local dev serves the frontend via Vite's own dev
// server/proxy instead (see frontend/vite.config.ts). Resolved relative to
// this module's own location so it works regardless of the host's working
// directory, same pattern as db.ts's .env resolution.
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, "../../frontend/dist");

  app.use(express.static(frontendDist));

  // SPA fallback for client-side routes (e.g. a hard refresh on
  // /trades/:id) — excludes /api/* so an unmatched API route keeps falling
  // through to its existing 404 behavior instead of getting index.html.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Must be registered last — after every router.
app.use(errorHandler);

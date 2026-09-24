import express from "express";
import { prisma } from "./db.js";
import { commoditiesRouter } from "./modules/commodities/routes.js";
import { counterpartiesRouter } from "./modules/counterparties/routes.js";
import { warehousesRouter } from "./modules/warehouses/routes.js";

export const app = express();

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/commodities", commoditiesRouter);
app.use("/api/counterparties", counterpartiesRouter);
app.use("/api/warehouses", warehousesRouter);

import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { listBalances, serializeBalance } from "../inventory/service.js";
import { listShipmentsInProgress, serializeShipment } from "../shipments/service.js";
import { getPositions } from "./service.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/positions",
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getPositions());
  }),
);

// Same InventoryBalance data as GET /api/inventory, reused as-is for the
// dashboard's inventory-by-warehouse widget (spec §7).
dashboardRouter.get(
  "/inventory-summary",
  asyncHandler(async (_req, res) => {
    const balances = await listBalances();
    res.status(200).json(balances.map(serializeBalance));
  }),
);

dashboardRouter.get(
  "/shipments-in-progress",
  asyncHandler(async (_req, res) => {
    const shipments = await listShipmentsInProgress();
    res.status(200).json(shipments.map(serializeShipment));
  }),
);

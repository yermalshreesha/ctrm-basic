import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { listCommodities } from "./service.js";

export const commoditiesRouter = Router();

commoditiesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const commodities = await listCommodities();
    res.status(200).json(commodities);
  }),
);

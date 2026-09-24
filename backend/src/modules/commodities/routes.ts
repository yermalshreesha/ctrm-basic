import { Router } from "express";
import { listCommodities } from "./service.js";

export const commoditiesRouter = Router();

commoditiesRouter.get("/", async (_req, res) => {
  const commodities = await listCommodities();
  res.status(200).json(commodities);
});

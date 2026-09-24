import { Router } from "express";
import { formatZodError, idParamSchema } from "../../shared/validation.js";
import { getWarehouseById, listWarehouses } from "./service.js";

export const warehousesRouter = Router();

warehousesRouter.get("/", async (_req, res) => {
  const warehouses = await listWarehouses();
  res.status(200).json(warehouses);
});

warehousesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }

  const warehouse = await getWarehouseById(parsed.data.id);
  if (!warehouse) {
    res.status(404).json({
      error: "not_found",
      message: `Warehouse ${parsed.data.id} not found`,
    });
    return;
  }

  res.status(200).json(warehouse);
});

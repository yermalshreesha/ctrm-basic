import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { formatZodError } from "../../shared/validation.js";
import { listMovementsQuerySchema } from "./schema.js";
import { listBalances, listMovements, serializeBalance, serializeMovement } from "./service.js";

export const inventoryRouter = Router();

// Nothing calls recordMovement yet (that starts in Phase 3b), so both
// routes return empty arrays until then — read-only, no create/edit
// endpoints exist for inventory at all; every stock change is a side
// effect of a shipment transition, never a direct API call.
inventoryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const balances = await listBalances();
    res.status(200).json(balances.map(serializeBalance));
  }),
);

inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const parsed = listMovementsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const movements = await listMovements(parsed.data);
    res.status(200).json(movements.map(serializeMovement));
  }),
);

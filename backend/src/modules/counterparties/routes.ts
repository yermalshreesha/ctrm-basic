import { Router } from "express";
import { formatZodError, idParamSchema } from "../../shared/validation.js";
import { getCounterpartyById, listCounterparties } from "./service.js";

export const counterpartiesRouter = Router();

counterpartiesRouter.get("/", async (_req, res) => {
  const counterparties = await listCounterparties();
  res.status(200).json(counterparties);
});

counterpartiesRouter.get("/:id", async (req, res) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json(formatZodError(parsed.error));
    return;
  }

  const counterparty = await getCounterpartyById(parsed.data.id);
  if (!counterparty) {
    res.status(404).json({
      error: "not_found",
      message: `Counterparty ${parsed.data.id} not found`,
    });
    return;
  }

  res.status(200).json(counterparty);
});

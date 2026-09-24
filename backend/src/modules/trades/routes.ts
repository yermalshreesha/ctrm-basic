import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { formatZodError, idParamSchema } from "../../shared/validation.js";
import {
  createTradeSchema,
  listTradesQuerySchema,
  patchTradeSchema,
} from "./schema.js";
import {
  cancelTrade,
  confirmTrade,
  createTrade,
  getTradeById,
  listTrades,
  patchTrade,
  serializeTrade,
} from "./service.js";

export const tradesRouter = Router();

tradesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listTradesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const trades = await listTrades(parsed.data);
    res.status(200).json(trades.map(serializeTrade));
  }),
);

tradesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = await createTradeSchema.safeParseAsync(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const trade = await createTrade(parsed.data);
    res.status(201).json(serializeTrade(trade));
  }),
);

tradesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const trade = await getTradeById(parsedId.data.id);
    if (!trade) {
      res.status(404).json({
        error: "not_found",
        message: `Trade ${parsedId.data.id} not found`,
      });
      return;
    }

    res.status(200).json(serializeTrade(trade));
  }),
);

tradesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const parsedBody = await patchTradeSchema.safeParseAsync(req.body);
    if (!parsedBody.success) {
      res.status(400).json(formatZodError(parsedBody.error));
      return;
    }

    const result = await patchTrade(parsedId.data.id, parsedBody.data);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeTrade(result.data));
  }),
);

tradesRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const result = await confirmTrade(parsedId.data.id);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeTrade(result.data));
  }),
);

tradesRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const result = await cancelTrade(parsedId.data.id);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeTrade(result.data));
  }),
);

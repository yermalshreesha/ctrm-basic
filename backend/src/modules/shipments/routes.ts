import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { formatZodError, idParamSchema } from "../../shared/validation.js";
import {
  createShipmentSchema,
  deliverShipmentSchema,
  departShipmentSchema,
  listShipmentsQuerySchema,
  patchShipmentSchema,
} from "./schema.js";
import {
  createShipment,
  deleteShipment,
  deliverShipment,
  departShipment,
  getShipmentById,
  listShipments,
  patchShipment,
  serializeShipment,
} from "./service.js";

export const shipmentsRouter = Router();

shipmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listShipmentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const shipments = await listShipments(parsed.data);
    res.status(200).json(shipments.map(serializeShipment));
  }),
);

shipmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = await createShipmentSchema.safeParseAsync(req.body);
    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    const result = await createShipment(parsed.data);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(201).json(serializeShipment(result.data));
  }),
);

shipmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const shipment = await getShipmentById(parsedId.data.id);
    if (!shipment) {
      res.status(404).json({ error: "not_found", message: `Shipment ${parsedId.data.id} not found` });
      return;
    }

    res.status(200).json(serializeShipment(shipment));
  }),
);

shipmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const parsedBody = await patchShipmentSchema.safeParseAsync(req.body);
    if (!parsedBody.success) {
      res.status(400).json(formatZodError(parsedBody.error));
      return;
    }

    const result = await patchShipment(parsedId.data.id, parsedBody.data);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeShipment(result.data));
  }),
);

shipmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const result = await deleteShipment(parsedId.data.id);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(204).send();
  }),
);

shipmentsRouter.post(
  "/:id/depart",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const parsedBody = await departShipmentSchema.safeParseAsync(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json(formatZodError(parsedBody.error));
      return;
    }

    const result = await departShipment(parsedId.data.id, parsedBody.data);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeShipment(result.data));
  }),
);

shipmentsRouter.post(
  "/:id/deliver",
  asyncHandler(async (req, res) => {
    const parsedId = idParamSchema.safeParse(req.params);
    if (!parsedId.success) {
      res.status(400).json(formatZodError(parsedId.error));
      return;
    }

    const parsedBody = await deliverShipmentSchema.safeParseAsync(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json(formatZodError(parsedBody.error));
      return;
    }

    const result = await deliverShipment(parsedId.data.id, parsedBody.data);
    if (!result.ok) {
      res.status(result.status).json(result.body);
      return;
    }

    res.status(200).json(serializeShipment(result.data));
  }),
);

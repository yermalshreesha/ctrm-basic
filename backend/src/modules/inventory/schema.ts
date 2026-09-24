import { z } from "zod";
import { prisma } from "../../db.js";
import { decimalField } from "../../shared/validation.js";

export const listMovementsQuerySchema = z.object({
  warehouseId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
  commodityId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
});

const warehouseIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.warehouse.findUnique({ where: { id } })) !== null, {
    message: "warehouse not found",
  });

const commodityIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.commodity.findUnique({ where: { id } })) !== null, {
    message: "commodity not found",
  });

// Shipment now exists (Phase 3b) and InventoryMovement.shipmentId has a
// real FOREIGN KEY (deferred from Phase 3a) — same existence-check
// treatment as warehouseId/commodityId, so a nonexistent shipmentId comes
// back as a 400 field error, not a raw FK-violation 500.
const shipmentIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.shipment.findUnique({ where: { id } })) !== null, {
    message: "shipment not found",
  });

// quantityMt: signed (BR-1) — positive to increase a balance, negative to
// decrease it — so it's the one caller of decimalField that sets
// allowNegative. maxIntegerDigits: 9 = precision 12 - scale 3 of
// InventoryMovement/InventoryBalance's DECIMAL(12,3) columns.
export const recordMovementSchema = z.object({
  warehouseId: warehouseIdField,
  commodityId: commodityIdField,
  shipmentId: shipmentIdField,
  quantityMt: decimalField("quantityMt", { maxDecimals: 3, maxIntegerDigits: 9, allowNegative: true }),
});

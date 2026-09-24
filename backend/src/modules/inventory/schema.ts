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

// quantityMt: signed (BR-1) — positive to increase a balance, negative to
// decrease it — so it's the one caller of decimalField that sets
// allowNegative. maxIntegerDigits: 9 = precision 12 - scale 3 of
// InventoryMovement/InventoryBalance's DECIMAL(12,3) columns.
export const recordMovementSchema = z.object({
  warehouseId: warehouseIdField,
  commodityId: commodityIdField,
  shipmentId: z.string().uuid({ message: "must be a valid UUID" }),
  quantityMt: decimalField("quantityMt", { maxDecimals: 3, maxIntegerDigits: 9, allowNegative: true }),
});

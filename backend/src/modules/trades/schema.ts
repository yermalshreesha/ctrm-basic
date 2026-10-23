import { z } from "zod";
import { prisma } from "../../db.js";
import { decimalField } from "../../shared/validation.js";

const commodityIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.commodity.findUnique({ where: { id } })) !== null, {
    message: "commodity not found",
  });

const counterpartyIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.counterparty.findUnique({ where: { id } })) !== null, {
    message: "counterparty not found",
  });

const dateField = z
  .string()
  .date("must be a valid date (YYYY-MM-DD)")
  .transform((value) => new Date(value));

// Optional, max 500 characters (BR-11). Whitespace-only input is trimmed
// and normalized to null — same as "no notes" — rather than stored as an
// empty/blank string.
const notesField = z
  .string()
  .max(500, { message: "notes must be at most 500 characters" })
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

// maxIntegerDigits = precision - scale of the DB column: DECIMAL(12,3) and
// DECIMAL(12,2) respectively.
const quantityMtField = decimalField("quantityMt", { maxDecimals: 3, maxIntegerDigits: 9 });
const priceField = decimalField("price", { maxDecimals: 2, maxIntegerDigits: 10 });

// Input is its own free type parameter (inferred from the schema argument,
// not defaulted to T): the schemas this wraps transform their raw string
// date fields to Date (dateField, above), so Output (T) and Input
// necessarily differ, and this helper only ever inspects the
// already-transformed Output in superRefine.
function withDeliveryPeriodCheck<T extends { deliveryPeriodStart: Date; deliveryPeriodEnd: Date }, Input>(
  schema: z.ZodType<T, z.ZodTypeDef, Input>,
) {
  return schema.superRefine((data, ctx) => {
    if (data.deliveryPeriodEnd.getTime() < data.deliveryPeriodStart.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryPeriodEnd"],
        message: "deliveryPeriodEnd must be on or after deliveryPeriodStart",
      });
    }
  });
}

export const createTradeSchema = withDeliveryPeriodCheck(
  z.object({
    commodityId: commodityIdField,
    direction: z.enum(["BUY", "SELL"]),
    counterpartyId: counterpartyIdField,
    quantityMt: quantityMtField,
    price: priceField,
    currency: z.enum(["USD", "EUR", "GBP"]),
    deliveryPeriodStart: dateField,
    deliveryPeriodEnd: dateField,
    notes: notesField,
  }),
);

export const patchTradeSchema = z.object({
  commodityId: commodityIdField.optional(),
  direction: z.enum(["BUY", "SELL"]).optional(),
  counterpartyId: counterpartyIdField.optional(),
  quantityMt: quantityMtField.optional(),
  price: priceField.optional(),
  currency: z.enum(["USD", "EUR", "GBP"]).optional(),
  deliveryPeriodStart: dateField.optional(),
  deliveryPeriodEnd: dateField.optional(),
  notes: notesField,
});

export const listTradesQuerySchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  commodityId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
  direction: z.enum(["BUY", "SELL"]).optional(),
});

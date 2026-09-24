import { z } from "zod";
import { prisma } from "../../db.js";

// Decimal fields (quantityMt, price) are strings end to end — in requests
// and responses (BR-1) — never JSON numbers, which would round-trip through
// a binary float. z.string() rejects a JSON number outright (400, wrong
// type) rather than coercing it. Positivity is checked with a regex on the
// digit string, never via Number(value) > 0, since a decimal with more
// digits than DECIMAL(12, 2/3) allows could lose precision if converted to
// a JS number first.
function decimalField(fieldLabel: string, maxDecimals: number) {
  return z
    .string({ invalid_type_error: `${fieldLabel} must be a string, e.g. "12.50"` })
    .refine((value) => /^\d+(\.\d+)?$/.test(value), {
      message: `${fieldLabel} must be a positive decimal number`,
    })
    .refine(
      (value) => {
        const decimals = value.includes(".") ? value.split(".")[1].length : 0;
        return decimals <= maxDecimals;
      },
      {
        message: `${fieldLabel} must have at most ${maxDecimals} decimal place${maxDecimals === 1 ? "" : "s"}`,
      },
    )
    .refine((value) => /[1-9]/.test(value), {
      message: `${fieldLabel} must be greater than 0`,
    });
}

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
  .date({ message: "must be a valid date (YYYY-MM-DD)" })
  .transform((value) => new Date(value));

function withDeliveryPeriodCheck<T extends { deliveryPeriodStart: Date; deliveryPeriodEnd: Date }>(
  schema: z.ZodType<T>,
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
    quantityMt: decimalField("quantityMt", 3),
    price: decimalField("price", 2),
    currency: z.enum(["USD", "EUR", "GBP"]),
    deliveryPeriodStart: dateField,
    deliveryPeriodEnd: dateField,
  }),
);

export const patchTradeSchema = z.object({
  commodityId: commodityIdField.optional(),
  direction: z.enum(["BUY", "SELL"]).optional(),
  counterpartyId: counterpartyIdField.optional(),
  quantityMt: decimalField("quantityMt", 3).optional(),
  price: decimalField("price", 2).optional(),
  currency: z.enum(["USD", "EUR", "GBP"]).optional(),
  deliveryPeriodStart: dateField.optional(),
  deliveryPeriodEnd: dateField.optional(),
});

export const listTradesQuerySchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  commodityId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
  direction: z.enum(["BUY", "SELL"]).optional(),
});

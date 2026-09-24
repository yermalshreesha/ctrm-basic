import { z } from "zod";
import { prisma } from "../../db.js";
import { localToday } from "../../shared/dates.js";
import { decimalField } from "../../shared/validation.js";

const tradeIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.trade.findUnique({ where: { id } })) !== null, {
    message: "trade not found",
  });

const warehouseIdField = z
  .string()
  .uuid({ message: "must be a valid UUID" })
  .refine(async (id) => (await prisma.warehouse.findUnique({ where: { id } })) !== null, {
    message: "warehouse not found",
  });

const dateField = z
  .string()
  .date("must be a valid date (YYYY-MM-DD)")
  .transform((value) => new Date(value));

// Optional in the request body — defaults to today (local calendar date,
// product owner decision) when omitted — and never in the future. Kept as
// a plain "YYYY-MM-DD" string through the default/bound checks (so
// comparisons against localToday() are exact lexicographic date
// comparisons, not Date-object/timezone arithmetic), only converted to a
// Date at the very end for the @db.Date column.
function actualDateField(fieldLabel: string) {
  return z
    .string()
    .date(`${fieldLabel} must be a valid date (YYYY-MM-DD)`)
    .optional()
    .transform((value) => value ?? localToday())
    .refine((value) => value <= localToday(), {
      message: `${fieldLabel} must not be in the future`,
    })
    .transform((value) => new Date(value));
}

function requiredText(fieldLabel: string) {
  return z.string({ invalid_type_error: `${fieldLabel} must be a string` }).min(1, `${fieldLabel} must not be empty`);
}

const quantityMtField = decimalField("quantityMt", { maxDecimals: 3, maxIntegerDigits: 9 });
const transportModeField = z.enum(["TRUCK", "RAIL", "VESSEL"]);

// Input is its own free type parameter (see the identical pattern in
// trades/schema.ts's withDeliveryPeriodCheck): dateField transforms its
// raw string input to Date, so Output (T) and Input necessarily differ.
function withPlannedPeriodCheck<T extends { plannedDepartureDate: Date; plannedArrivalDate: Date }, Input>(
  schema: z.ZodType<T, z.ZodTypeDef, Input>,
) {
  return schema.superRefine((data, ctx) => {
    if (data.plannedArrivalDate.getTime() < data.plannedDepartureDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plannedArrivalDate"],
        message: "plannedArrivalDate must be on or after plannedDepartureDate",
      });
    }
  });
}

// status, actualDepartureDate and actualArrivalDate are deliberately
// absent — system-set (status defaults PLANNED; the actual dates are only
// ever set by depart/deliver), so a client-sent value for any of them is
// silently ignored, same treatment as Trade's create/patch schemas
// ignoring a client-sent status.
export const createShipmentSchema = withPlannedPeriodCheck(
  z.object({
    tradeId: tradeIdField,
    warehouseId: warehouseIdField,
    quantityMt: quantityMtField,
    transportMode: transportModeField,
    origin: requiredText("origin"),
    destination: requiredText("destination"),
    plannedDepartureDate: dateField,
    plannedArrivalDate: dateField,
  }),
);

// tradeId is deliberately absent: immutable once a shipment is created —
// a shipment never moves to a different trade.
export const patchShipmentSchema = z.object({
  warehouseId: warehouseIdField.optional(),
  quantityMt: quantityMtField.optional(),
  transportMode: transportModeField.optional(),
  origin: requiredText("origin").optional(),
  destination: requiredText("destination").optional(),
  plannedDepartureDate: dateField.optional(),
  plannedArrivalDate: dateField.optional(),
});

export const listShipmentsQuerySchema = z.object({
  status: z.enum(["PLANNED", "IN_TRANSIT", "DELIVERED"]).optional(),
  tradeId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
  warehouseId: z.string().uuid({ message: "must be a valid UUID" }).optional(),
});

export const departShipmentSchema = z.object({
  actualDepartureDate: actualDateField("actualDepartureDate"),
});

export const deliverShipmentSchema = z.object({
  actualArrivalDate: actualDateField("actualArrivalDate"),
});

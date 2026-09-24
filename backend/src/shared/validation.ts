import { z, type ZodError } from "zod";

export const idParamSchema = z.object({
  id: z.string().uuid({ message: "must be a valid UUID" }),
});

export function formatZodError(error: ZodError) {
  return {
    error: "validation_failed",
    fields: error.issues.map((issue) => ({
      field: issue.path.join(".") || "value",
      message: issue.message,
    })),
  };
}

export interface DecimalFieldOptions {
  maxDecimals: number;
  // Digits allowed before the decimal point — precision minus scale of the
  // target DECIMAL(precision, scale) column, e.g. 9 for DECIMAL(12,3), 10
  // for DECIMAL(12,2). Without this, a value with too many integer digits
  // parses fine here but fails at the DB as a numeric field overflow.
  maxIntegerDigits: number;
  allowNegative?: boolean;
}

// Decimal fields (money, quantities) are strings end to end — in requests
// and stored values (BR-1) — never JSON numbers, which would round-trip
// through a binary float. z.string() rejects a JSON number outright (400,
// wrong type) rather than coercing it. Bounds (sign, integer digits,
// decimal places, non-zero) are all checked with regexes/length on the
// digit string, never via Number(value), since a decimal with more digits
// than the column allows could lose precision if converted to a JS number
// first.
export function decimalField(fieldLabel: string, options: DecimalFieldOptions) {
  const { maxDecimals, maxIntegerDigits, allowNegative = false } = options;
  const pattern = allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;

  return z
    .string({ invalid_type_error: `${fieldLabel} must be a string, e.g. "12.50"` })
    .refine((value) => pattern.test(value), {
      message: `${fieldLabel} must be a${allowNegative ? "" : " positive"} decimal number`,
    })
    .refine((value) => value.replace("-", "").split(".")[0].length <= maxIntegerDigits, {
      message: `${fieldLabel} must have at most ${maxIntegerDigits} digit${maxIntegerDigits === 1 ? "" : "s"} before the decimal point`,
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
      message: allowNegative ? `${fieldLabel} must not be zero` : `${fieldLabel} must be greater than 0`,
    });
}

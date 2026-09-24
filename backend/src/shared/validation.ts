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

import type { ErrorRequestHandler } from "express";

// Redacts secrets that tend to show up inside error messages (e.g. a
// Postgres connection error embeds the connection string, credentials
// included) before the message is logged — ctrm-standards #8.
function redactSecrets(message: string): string {
  return message
    .replace(/(\/\/[^:/\s]+):[^@\s]+@/g, "$1:[redacted]@")
    .replace(/(password)\s*[=:]\s*\S+/gi, "$1=[redacted]");
}

// Global error handler — must be registered last, after every router
// (Express recognizes error-handling middleware by its 4-parameter arity).
// Returns a generic 500 with no internal details (message, stack, query
// text, etc. never reach the client — ctrm-standards #8); only safe,
// redacted fields of the real error are logged server-side for
// debugging — never the raw error object, which may carry a connection
// string (e.g. Prisma's `.meta`) or other secrets in unredacted form.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `next` must be declared for Express's arity-based error-middleware detection, even though it's never called.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  const message = err instanceof Error ? err.message : String(err);
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code: unknown }).code : undefined;
  console.error({ message: redactSecrets(message), code });
  res.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
};

import type { ErrorRequestHandler } from "express";

// Global error handler — must be registered last, after every router
// (Express recognizes error-handling middleware by its 4-parameter arity).
// Returns a generic 500 with no internal details (message, stack, query
// text, etc. never reach the client — ctrm-standards #8); the real error
// is logged server-side for debugging.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `next` must be declared for Express's arity-based error-middleware detection, even though it's never called.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
};

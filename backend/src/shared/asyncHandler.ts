import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 (this project's version) does not forward a rejected promise
// from an async route handler to error-handling middleware — an unhandled
// rejection results instead. Wrapping every async handler routes its
// errors to next(err), so they reach the global error handler in
// src/shared/errorHandler.ts.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Express 4 doesn't auto-forward async errors. Wrap async handlers with this. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

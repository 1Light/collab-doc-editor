// apps/api/src/middleware/validateRequest.ts

import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Validates request parts using Zod.
 * If validation fails, it throws a ZodError which is handled by errorHandler.ts
 *
 * Usage:
 * router.post(
 *   "/auth/login",
 *   validateRequest({ body: loginRequestSchema }),
 *   authController.login
 * );
 */
export function validateRequest(schemas: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export class RequestIdMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);

  use = (request: Request, response: Response, next: NextFunction): void => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    const startedAt = performance.now();

    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.on("finish", () => {
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt)
        })
      );
    });

    next();
  };
}

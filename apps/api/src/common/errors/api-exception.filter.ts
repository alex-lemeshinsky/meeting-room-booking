import {
  BadRequestException,
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
  type ValidationError
} from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "./app-error.js";

interface ErrorBody {
  code?: unknown;
  fields?: unknown;
  message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const requestId = response.locals.requestId as string | undefined;
    const error = toApiError(exception);

    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        requestId: requestId ?? "unknown"
      }
    });
  }
}

export function validationExceptionFactory(
  errors: ValidationError[]
): BadRequestException {
  const fields = Object.fromEntries(
    errors.flatMap((error) =>
      error.constraints
        ? [[error.property, Object.values(error.constraints)]]
        : []
    )
  );

  return new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
    fields
  });
}

function toApiError(exception: unknown): {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string[]>;
} {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      ...(exception.fields ? { fields: exception.fields } : {})
    };
  }

  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    const details = isErrorBody(body) ? body : {};
    return {
      status: exception.getStatus(),
      code: typeof details.code === "string" ? details.code : "HTTP_ERROR",
      message:
        typeof details.message === "string"
          ? details.message
          : "Request could not be processed",
      ...(isFields(details.fields) ? { fields: details.fields } : {})
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error"
  };
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null;
}

function isFields(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.every((message) => typeof message === "string")
    )
  );
}

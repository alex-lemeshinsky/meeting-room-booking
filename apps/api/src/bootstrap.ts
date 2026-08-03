import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import "reflect-metadata";
import { AppModule } from "./app.module.js";
import {
  ApiExceptionFilter,
  validationExceptionFactory
} from "./common/errors/api-exception.filter.js";
import { RequestIdMiddleware } from "./common/http/request-id.middleware.js";
import { OpenApiModule } from "./openapi/openapi.module.js";

async function createApplication(
  module: typeof AppModule | typeof OpenApiModule
): Promise<INestApplication> {
  const app = await NestFactory.create(module, { bufferLogs: true });
  app.enableShutdownHooks();
  return configureApp(app);
}

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api/v1", { exclude: ["events"] });
  app.use(cookieParser());
  const requestIds = new RequestIdMiddleware();
  app.use(requestIds.use);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
      exceptionFactory: validationExceptionFactory
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}

export function createApp(): Promise<INestApplication> {
  return createApplication(AppModule);
}

export function createOpenApiApp(): Promise<INestApplication> {
  return createApplication(OpenApiModule);
}

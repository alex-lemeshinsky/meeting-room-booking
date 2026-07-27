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

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  return configureApp(app);
}

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix("api/v1");
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

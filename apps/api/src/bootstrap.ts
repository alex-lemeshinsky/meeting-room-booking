import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module.js";
import { OpenApiModule } from "./openapi/openapi.module.js";

async function createApplication(
  module: typeof AppModule | typeof OpenApiModule
): Promise<INestApplication> {
  const app = await NestFactory.create(module, { bufferLogs: true });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();
  return app;
}

export function createApp(): Promise<INestApplication> {
  return createApplication(AppModule);
}

export function createOpenApiApp(): Promise<INestApplication> {
  return createApplication(OpenApiModule);
}

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { CLOCK, FixedClock } from "@mrb/time";
import { E2E_NOW_ISO } from "../../../e2e/support/e2e-clock.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap.js";

export function createE2eTestingModule(): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(new FixedClock(new Date(E2E_NOW_ISO)))
    .compile();
}

export async function createE2eApp(): Promise<INestApplication> {
  const module = await createE2eTestingModule();
  const app = module.createNestApplication({ bufferLogs: true });
  app.enableShutdownHooks();
  return configureApp(app);
}

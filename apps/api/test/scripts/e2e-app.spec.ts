import { CLOCK, type Clock } from "@mrb/time";
import { describe, expect, it } from "vitest";
import { E2E_NOW_ISO } from "../../../../e2e/support/e2e-clock.js";
import { createE2eTestingModule } from "../../scripts/e2e-app.js";

describe("E2E API bootstrap", () => {
  it("installs the shared E2E instant as the API clock", async () => {
    const module = await createE2eTestingModule();

    try {
      expect(module.get<Clock>(CLOCK).now().toISOString()).toBe(E2E_NOW_ISO);
    } finally {
      await module.close();
    }
  });
});

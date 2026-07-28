import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { E2eLifecycle } from "../../scripts/e2e-launcher.js";

class FakeApiProcess extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  readonly signals: NodeJS.Signals[] = [];
  signalCode: NodeJS.Signals | null = null;

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    this.killed = true;

    if (signal === "SIGKILL") {
      this.exitCode = 1;
      queueMicrotask(() => this.emit("exit", 1, signal));
    }

    return true;
  }
}

describe("E2eLifecycle", () => {
  it("stops PostgreSQL acquired after shutdown was requested during startup", async () => {
    const postgres = { stop: vi.fn().mockResolvedValue(undefined) };
    const lifecycle = new E2eLifecycle();

    lifecycle.requestShutdown(130);
    lifecycle.attachPostgres(postgres);
    await lifecycle.finalize();

    expect(postgres.stop).toHaveBeenCalledOnce();
    expect(lifecycle.exitCode).toBe(130);
  });

  it("escalates a non-exiting API child before stopping PostgreSQL", async () => {
    const events: string[] = [];
    const postgres = {
      stop: vi.fn().mockImplementation(async () => {
        events.push("postgres");
      })
    };
    const api = new FakeApiProcess();
    const lifecycle = new E2eLifecycle({ terminationTimeoutMs: 1 });

    api.once("exit", () => events.push("api"));
    lifecycle.attachPostgres(postgres);
    lifecycle.attachApi(api);
    lifecycle.requestShutdown(143);
    await lifecycle.finalize();

    expect(api.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(events).toEqual(["api", "postgres"]);
    expect(lifecycle.exitCode).toBe(143);
  });
});

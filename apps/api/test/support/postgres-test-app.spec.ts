import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  app: {
    close: vi.fn(),
    init: vi.fn()
  },
  createApp: vi.fn(),
  postgres: {
    getConnectionUri: vi.fn(),
    stop: vi.fn()
  },
  spawnSync: vi.fn(),
  start: vi.fn()
}));

vi.mock("@testcontainers/postgresql", () => ({
  PostgreSqlContainer: class {
    start(): unknown {
      return state.start();
    }
  }
}));

vi.mock("node:child_process", () => ({ spawnSync: state.spawnSync }));
vi.mock("../../src/bootstrap.js", () => ({ createApp: state.createApp }));

import { startPostgresTestApp } from "./postgres-test-app.js";

describe("startPostgresTestApp", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAppOrigin = process.env.APP_ORIGIN;

  afterEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.APP_ORIGIN = originalAppOrigin;
  });

  it("closes a partially initialized app before stopping PostgreSQL", async () => {
    const initializationError = new Error("app initialization failed");
    state.start.mockResolvedValue(state.postgres);
    state.postgres.getConnectionUri.mockReturnValue("postgresql://test");
    state.spawnSync.mockReturnValue({ status: 0, stderr: "" });
    state.createApp.mockResolvedValue(state.app);
    state.app.init.mockRejectedValue(initializationError);

    await expect(startPostgresTestApp()).rejects.toThrow(initializationError);

    expect(state.app.close).toHaveBeenCalledOnce();
    expect(state.postgres.stop).toHaveBeenCalledOnce();
    expect(state.app.close.mock.invocationCallOrder[0]).toBeLessThan(
      state.postgres.stop.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });
});

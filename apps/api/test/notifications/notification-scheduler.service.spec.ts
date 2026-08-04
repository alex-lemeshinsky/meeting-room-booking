import { FixedClock } from "@mrb/time";
import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { DatabaseService } from "../../src/database/database.service.js";
import { NotificationSchedulerService } from "../../src/notifications/notification-scheduler.service.js";

const NOW = new Date("2035-01-15T11:52:00.000Z");

describe("NotificationSchedulerService", () => {
  function createMockConfigService(notifyBeforeMinutes = "10"): ConfigService {
    return {
      get: vi.fn().mockImplementation((key: string, defaultValue: string) => {
        if (key === "NOTIFY_BEFORE_MINUTES") return notifyBeforeMinutes;
        return defaultValue;
      })
    } as unknown as ConfigService;
  }

  function createUnconfiguredConfigService(): ConfigService {
    return {
      get: vi
        .fn()
        .mockImplementation(
          (_key: string, defaultValue: string) => defaultValue
        )
    } as unknown as ConfigService;
  }

  function createMockEventEmitter(): EventEmitter2 {
    return {
      emit: vi.fn()
    } as unknown as EventEmitter2;
  }

  function createMockDatabaseService(txMock: unknown): DatabaseService {
    return {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txMock))
    } as unknown as DatabaseService;
  }

  it("exits early without running candidate detection query if advisory lock is not acquired", async () => {
    const queryRawMock = vi.fn().mockResolvedValueOnce([{ acquired: false }]);
    const txMock = { $queryRaw: queryRawMock };
    const database = createMockDatabaseService(txMock);
    const eventEmitter = createMockEventEmitter();
    const configService = createMockConfigService("10");

    const scheduler = new NotificationSchedulerService(
      database,
      eventEmitter,
      configService,
      new FixedClock(NOW)
    );

    const count = await scheduler.processNotifications();

    expect(count).toBe(0);
    expect(queryRawMock).toHaveBeenCalledOnce();
    // Verify candidate detection query was NOT executed
  });

  it("detects active back-to-back bookings within NOTIFY_BEFORE_MINUTES window, formats Ukrainian message, inserts row and emits notification.created event", async () => {
    const candidate = {
      current_booking_id: "10000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000001",
      current_title: "Sprint Sync",
      end_at: new Date("2035-01-15T12:00:00.000Z"),
      next_booking_id: "10000000-0000-4000-8000-000000000002",
      next_title: "Client Pitch",
      next_start_at: new Date("2035-01-15T12:00:00.000Z"),
      room_name: "Переговорна 1"
    };

    const insertedNotification = {
      id: "90000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000001"
    };

    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([{ acquired: true }]) // advisory lock query
      .mockResolvedValueOnce([candidate]) // candidate detection query
      .mockResolvedValueOnce([insertedNotification]); // insert notification query

    const txMock = { $queryRaw: queryRawMock };
    const database = createMockDatabaseService(txMock);
    const eventEmitter = createMockEventEmitter();
    const configService = createMockConfigService("10");

    const scheduler = new NotificationSchedulerService(
      database,
      eventEmitter,
      configService,
      new FixedClock(NOW)
    );

    const count = await scheduler.processNotifications();

    expect(count).toBe(1);
    expect(queryRawMock).toHaveBeenCalledTimes(3);

    const expectedMessage =
      "«Sprint Sync» у Переговорна 1 завершується за 10 хв — наступне бронювання починається одразу";

    const insertCallArgs = queryRawMock.mock.calls[2];
    expect(insertCallArgs).toBeDefined();
    expect(insertCallArgs).toContain(expectedMessage);

    expect(eventEmitter.emit).toHaveBeenCalledWith("notification.created", {
      userId: insertedNotification.user_id,
      notificationId: insertedNotification.id
    });
  });

  it("falls back to the documented 10-minute window when NOTIFY_BEFORE_MINUTES is unset", async () => {
    const candidate = {
      current_booking_id: "10000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000001",
      current_title: "Sprint Sync",
      end_at: new Date("2035-01-15T12:00:00.000Z"),
      next_booking_id: "10000000-0000-4000-8000-000000000002",
      next_title: "Client Pitch",
      next_start_at: new Date("2035-01-15T12:00:00.000Z"),
      room_name: "Переговорна 1"
    };

    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([{ acquired: true }]) // advisory lock query
      .mockResolvedValueOnce([candidate]) // candidate detection query
      .mockResolvedValueOnce([
        {
          id: "90000000-0000-4000-8000-000000000001",
          user_id: candidate.user_id
        }
      ]); // insert notification query

    const txMock = { $queryRaw: queryRawMock };

    const scheduler = new NotificationSchedulerService(
      createMockDatabaseService(txMock),
      createMockEventEmitter(),
      createUnconfiguredConfigService(),
      new FixedClock(NOW)
    );

    await scheduler.processNotifications();

    const insertCallArgs = queryRawMock.mock.calls[2];
    expect(insertCallArgs).toBeDefined();
    expect(insertCallArgs).toContain(
      "«Sprint Sync» у Переговорна 1 завершується за 10 хв — наступне бронювання починається одразу"
    );
  });

  it("skips candidates when current_b or next_b status is not ACTIVE (empty candidate array returned by query)", async () => {
    // DB query filters status = 'ACTIVE' on both bookings, so non-ACTIVE returns empty candidate set
    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([{ acquired: true }]) // advisory lock
      .mockResolvedValueOnce([]); // candidates query returns empty

    const txMock = { $queryRaw: queryRawMock };
    const database = createMockDatabaseService(txMock);
    const eventEmitter = createMockEventEmitter();
    const configService = createMockConfigService("10");

    const scheduler = new NotificationSchedulerService(
      database,
      eventEmitter,
      configService,
      new FixedClock(NOW)
    );

    const count = await scheduler.processNotifications();

    expect(count).toBe(0);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { DatabaseService } from "../../src/database/database.service.js";
import {
  LISTENER_RECONNECT_INITIAL_DELAY_MS,
  LISTENER_RECONNECT_MAX_DELAY_MS,
  NOTIFICATION_EVENT_CHANNEL,
  NotificationEventRelay,
  type NotificationListenerClient,
  type NotificationListenerClientFactory
} from "../../src/notifications/notification-event-relay.service.js";

beforeEach(() => {
  // The reconnect cases drive the listener's error path on purpose; keep their
  // expected Nest logs out of the suite output.
  vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DATABASE_URL =
  "postgresql://meeting_room:meeting_room@db:5432/meeting_room";
const EVENT = {
  userId: "00000000-0000-4000-8000-000000000001",
  notificationId: "40000000-0000-4000-8000-000000000001"
};

class FakeNotificationListenerClient implements NotificationListenerClient {
  readonly connect = vi.fn().mockResolvedValue(undefined);
  readonly query = vi.fn().mockResolvedValue(undefined);
  readonly end = vi.fn().mockResolvedValue(undefined);
  private notificationListener?: (message: {
    channel: string;
    payload?: string;
  }) => void;
  private errorListener?: (error: Error) => void;

  onError(listener: (error: Error) => void): void {
    this.errorListener = listener;
  }

  subscribe(
    listener: (message: { channel: string; payload?: string }) => void
  ): void {
    this.notificationListener = listener;
  }

  notify(channel: string, payload?: string): void {
    this.notificationListener?.(
      payload === undefined ? { channel } : { channel, payload }
    );
  }

  fail(error = new Error("connection terminated")): void {
    this.errorListener?.(error);
  }
}

function createSubject() {
  // Each connect attempt gets its own client, mirroring pg.Client, which cannot
  // be reused once its connection has errored.
  const clients = [new FakeNotificationListenerClient()];
  let createCount = 0;
  const clientFactory: NotificationListenerClientFactory = {
    create: vi.fn().mockImplementation(() => {
      createCount += 1;
      if (createCount > clients.length) {
        clients.push(new FakeNotificationListenerClient());
      }
      return clients[createCount - 1];
    })
  };
  const database = {
    $executeRaw: vi.fn().mockResolvedValue(1)
  } as unknown as DatabaseService;
  const eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;
  const config = {
    getOrThrow: vi.fn().mockReturnValue(DATABASE_URL)
  } as unknown as ConfigService;

  return {
    clients,
    client: clients[0]!,
    clientFactory,
    database,
    eventEmitter,
    relay: new NotificationEventRelay(
      database,
      eventEmitter,
      config,
      clientFactory
    )
  };
}

describe("NotificationEventRelay", () => {
  it("listens for committed notification events and relays a valid payload locally", async () => {
    const { relay, client, clientFactory, eventEmitter } = createSubject();

    await relay.onModuleInit();
    client.notify(NOTIFICATION_EVENT_CHANNEL, JSON.stringify(EVENT));

    expect(clientFactory.create).toHaveBeenCalledWith(DATABASE_URL);
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith(
      `LISTEN ${NOTIFICATION_EVENT_CHANNEL}`
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "notification.created",
      EVENT
    );
  });

  it("ignores a different channel and malformed channel payload", async () => {
    const { relay, client, eventEmitter } = createSubject();

    await relay.onModuleInit();
    client.notify("another_channel", JSON.stringify(EVENT));
    client.notify(NOTIFICATION_EVENT_CHANNEL, "not-json");
    client.notify(NOTIFICATION_EVENT_CHANNEL, JSON.stringify({ userId: 1 }));

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it("publishes only JSON event data through a parameterized pg_notify query", async () => {
    const { relay, database } = createSubject();

    await relay.publish(EVENT);

    expect(database.$executeRaw).toHaveBeenCalledOnce();
    const [sql, channel, payload] = vi.mocked(database.$executeRaw).mock
      .calls[0]!;
    if (!Array.isArray(sql)) {
      throw new Error("Expected a tagged SQL template");
    }
    expect(sql.join("")).toContain("SELECT pg_notify(");
    expect(channel).toBe(NOTIFICATION_EVENT_CHANNEL);
    expect(payload).toBe(JSON.stringify(EVENT));
  });

  it("closes its listener client during application shutdown", async () => {
    const { relay, client } = createSubject();

    await relay.onModuleInit();
    await relay.onModuleDestroy();

    expect(client.end).toHaveBeenCalledOnce();
  });

  it("re-establishes the listener after the connection drops", async () => {
    vi.useFakeTimers();
    const { relay, clients } = createSubject();

    await relay.onModuleInit();
    clients[0]!.fail();

    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);

    expect(clients).toHaveLength(2);
    expect(clients[0]!.end).toHaveBeenCalledOnce();
    expect(clients[1]!.connect).toHaveBeenCalledOnce();
    expect(clients[1]!.query).toHaveBeenCalledWith(
      `LISTEN ${NOTIFICATION_EVENT_CHANNEL}`
    );

    await relay.onModuleDestroy();
  });

  it("relays events over the reconnected listener", async () => {
    vi.useFakeTimers();
    const { relay, clients, eventEmitter } = createSubject();

    await relay.onModuleInit();
    clients[0]!.fail();
    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);

    clients[1]!.notify(NOTIFICATION_EVENT_CHANNEL, JSON.stringify(EVENT));

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      "notification.created",
      EVENT
    );
    await relay.onModuleDestroy();
  });

  it("backs off before each retry while the database stays unreachable", async () => {
    vi.useFakeTimers();
    const { relay, clients } = createSubject();

    await relay.onModuleInit();
    clients[1] = new FakeNotificationListenerClient();
    clients[1].connect.mockRejectedValue(new Error("ECONNREFUSED"));
    clients[0]!.fail();

    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);
    expect(clients[1].connect).toHaveBeenCalledOnce();
    expect(clients).toHaveLength(2);

    // A second attempt must not fire on the same short delay.
    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);
    expect(clients).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);
    expect(clients).toHaveLength(3);

    await relay.onModuleDestroy();
  });

  it("ignores a late error from a connection that was already replaced", async () => {
    vi.useFakeTimers();
    const { relay, clients } = createSubject();

    await relay.onModuleInit();
    clients[0]!.fail();
    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_INITIAL_DELAY_MS);
    expect(clients).toHaveLength(2);

    clients[0]!.fail();
    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_MAX_DELAY_MS);

    expect(clients).toHaveLength(2);
    expect(clients[1]!.end).not.toHaveBeenCalled();

    await relay.onModuleDestroy();
  });

  it("stops reconnecting once the module is destroyed", async () => {
    vi.useFakeTimers();
    const { relay, clients } = createSubject();

    await relay.onModuleInit();
    clients[0]!.fail();
    await relay.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(LISTENER_RECONNECT_MAX_DELAY_MS * 2);

    expect(clients).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { DatabaseService } from "../../src/database/database.service.js";
import {
  NOTIFICATION_EVENT_CHANNEL,
  NotificationEventRelay,
  type NotificationListenerClient,
  type NotificationListenerClientFactory
} from "../../src/notifications/notification-event-relay.service.js";

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

  onError(listener: (error: Error) => void): void {
    // The unit test does not need to trigger the connection error path.
    void listener;
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
}

function createSubject() {
  const client = new FakeNotificationListenerClient();
  const clientFactory: NotificationListenerClientFactory = {
    create: vi.fn().mockReturnValue(client)
  };
  const database = {
    $executeRaw: vi.fn().mockResolvedValue(1)
  } as unknown as DatabaseService;
  const eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;
  const config = {
    getOrThrow: vi.fn().mockReturnValue(DATABASE_URL)
  } as unknown as ConfigService;

  return {
    client,
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
});

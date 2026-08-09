import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Client } from "pg";
import { DatabaseService } from "../database/database.service.js";
import type {
  NotificationCreatedEvent,
  NotificationEventPublisher,
  NotificationTransaction
} from "./notification-scheduler.service.js";

export const NOTIFICATION_EVENT_CHANNEL = "mrb_notification_created";
export const NOTIFICATION_LISTENER_CLIENT_FACTORY = Symbol(
  "NOTIFICATION_LISTENER_CLIENT_FACTORY"
);

// A dropped listener connection silently costs this instance every notification
// raised by another instance, so the listener re-establishes itself. The delay
// backs off to avoid hammering a database that is still down.
export const LISTENER_RECONNECT_INITIAL_DELAY_MS = 1_000;
export const LISTENER_RECONNECT_MAX_DELAY_MS = 30_000;

interface NotificationMessage {
  channel: string;
  payload?: string;
}

export interface NotificationListenerClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  onError(listener: (error: Error) => void): void;
  query(sql: string): Promise<unknown>;
  subscribe(listener: (message: NotificationMessage) => void): void;
}

export interface NotificationListenerClientFactory {
  create(connectionString: string): NotificationListenerClient;
}

export const notificationListenerClientFactory: NotificationListenerClientFactory =
  {
    create(connectionString) {
      const client = new Client({ connectionString });
      return {
        connect: () => client.connect(),
        end: () => client.end(),
        onError(listener) {
          client.on("error", listener);
        },
        query: (sql) => client.query(sql),
        subscribe(listener) {
          client.on("notification", (message) => {
            listener(
              message.payload === undefined
                ? { channel: message.channel }
                : { channel: message.channel, payload: message.payload }
            );
          });
        }
      };
    }
  };

@Injectable()
export class NotificationEventRelay
  implements NotificationEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEventRelay.name);
  private client: NotificationListenerClient | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectDelayMs = LISTENER_RECONNECT_INITIAL_DELAY_MS;
  private isReconnecting = false;
  private isStopped = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(NOTIFICATION_LISTENER_CLIENT_FACTORY)
    private readonly listenerClientFactory: NotificationListenerClientFactory
  ) {}

  // A listener that cannot be established at startup fails boot rather than
  // leaving the instance quietly half-connected; only a later drop is retried.
  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isStopped = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const client = this.client;
    this.client = undefined;
    await client?.end();
  }

  private async connect(): Promise<void> {
    const client = this.listenerClientFactory.create(
      this.config.getOrThrow<string>("DATABASE_URL")
    );
    client.subscribe(this.handleNotification);
    // Bound to this specific client so a superseded connection's late error
    // cannot tear down the healthy one that replaced it.
    client.onError((error) => this.handleListenerError(client, error));
    this.client = client;

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFICATION_EVENT_CHANNEL}`);
      this.reconnectDelayMs = LISTENER_RECONNECT_INITIAL_DELAY_MS;
    } catch (error) {
      this.client = undefined;
      await client.end();
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (
      this.isStopped ||
      this.isReconnecting ||
      this.reconnectTimer !== undefined
    ) {
      return;
    }

    const delayMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      delayMs * 2,
      LISTENER_RECONNECT_MAX_DELAY_MS
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.reconnect();
    }, delayMs);
  }

  private async reconnect(): Promise<void> {
    if (this.isStopped) return;

    this.isReconnecting = true;
    try {
      await this.connect();
      this.logger.log("PostgreSQL notification listener reconnected");
    } catch (error) {
      this.logger.error(
        "PostgreSQL notification listener reconnect failed",
        error
      );
      this.isReconnecting = false;
      this.scheduleReconnect();
      return;
    }
    this.isReconnecting = false;
  }

  async publish(
    transaction: NotificationTransaction,
    event: NotificationCreatedEvent
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_notify(${NOTIFICATION_EVENT_CHANNEL}, ${JSON.stringify(event)})`;
  }

  private readonly handleNotification = (
    message: NotificationMessage
  ): void => {
    if (message.channel !== NOTIFICATION_EVENT_CHANNEL) return;

    const event = parseNotificationCreatedEvent(message.payload);
    if (!event) return;

    this.eventEmitter.emit("notification.created", event);
  };

  private readonly handleListenerError = (
    client: NotificationListenerClient,
    error: Error
  ): void => {
    if (this.client !== client) return;

    this.logger.error("PostgreSQL notification listener failed", error);
    this.client = undefined;
    void client.end().catch(() => undefined);
    this.scheduleReconnect();
  };
}

function parseNotificationCreatedEvent(
  payload: string | undefined
): NotificationCreatedEvent | undefined {
  if (!payload) return undefined;

  try {
    const parsed: unknown = JSON.parse(payload);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("userId" in parsed) ||
      !("notificationId" in parsed) ||
      typeof parsed.userId !== "string" ||
      parsed.userId.length === 0 ||
      typeof parsed.notificationId !== "string" ||
      parsed.notificationId.length === 0
    ) {
      return undefined;
    }

    return {
      userId: parsed.userId,
      notificationId: parsed.notificationId
    };
  } catch {
    return undefined;
  }
}

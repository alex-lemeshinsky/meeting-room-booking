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
  NotificationEventPublisher
} from "./notification-scheduler.service.js";

export const NOTIFICATION_EVENT_CHANNEL = "mrb_notification_created";
export const NOTIFICATION_LISTENER_CLIENT_FACTORY = Symbol(
  "NOTIFICATION_LISTENER_CLIENT_FACTORY"
);

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

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(NOTIFICATION_LISTENER_CLIENT_FACTORY)
    private readonly listenerClientFactory: NotificationListenerClientFactory
  ) {}

  async onModuleInit(): Promise<void> {
    const client = this.listenerClientFactory.create(
      this.config.getOrThrow<string>("DATABASE_URL")
    );
    client.subscribe(this.handleNotification);
    client.onError(this.handleListenerError);
    this.client = client;

    try {
      await client.connect();
      await client.query(`LISTEN ${NOTIFICATION_EVENT_CHANNEL}`);
    } catch (error) {
      this.client = undefined;
      await client.end();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.end();
  }

  async publish(event: NotificationCreatedEvent): Promise<void> {
    await this.database
      .$executeRaw`SELECT pg_notify(${NOTIFICATION_EVENT_CHANNEL}, ${JSON.stringify(event)})`;
  }

  private readonly handleNotification = (
    message: NotificationMessage
  ): void => {
    if (message.channel !== NOTIFICATION_EVENT_CHANNEL) return;

    const event = parseNotificationCreatedEvent(message.payload);
    if (!event) return;

    this.eventEmitter.emit("notification.created", event);
  };

  private readonly handleListenerError = (error: Error): void => {
    this.logger.error("PostgreSQL notification listener failed", error);
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

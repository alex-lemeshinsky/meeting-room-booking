import {
  Controller,
  Inject,
  Req,
  Sse,
  UseGuards,
  type MessageEvent
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Observable } from "rxjs";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import type { NotificationCreatedEvent } from "./notification-scheduler.service.js";

// Without traffic an SSE stream is idle, and reverse proxies close idle
// upstreams on their own read timeout (nginx defaults to 60s). Every close
// costs a reconnect window in which no listener is attached and pushed
// notifications are lost, so keep the stream busy well inside that default.
export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;

@ApiTags("notifications")
@Controller()
export class NotificationSseController {
  constructor(
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2
  ) {}

  @Sse("events")
  @UseGuards(SessionGuard)
  @ApiOperation({ operationId: "notificationEventsStream" })
  @ApiCookieAuth()
  events(@Req() request: AuthenticatedRequest): Observable<MessageEvent> {
    const userId = request.auth.user.id;

    return new Observable<MessageEvent>((subscriber) => {
      const listener = (event: NotificationCreatedEvent) => {
        if (event.userId === userId) {
          subscriber.next({
            data: JSON.stringify({
              type: "notification",
              id: event.notificationId
            })
          });
        }
      };

      this.eventEmitter.on("notification.created", listener);

      // Clients ignore a non-default event type, so this keeps proxies from
      // treating the stream as idle without reaching onmessage.
      const heartbeat = setInterval(() => {
        subscriber.next({ type: "heartbeat", data: "" });
      }, SSE_HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        this.eventEmitter.off("notification.created", listener);
      };

      request.on("close", cleanup);

      return () => {
        cleanup();
        request.removeListener("close", cleanup);
      };
    });
  }
}

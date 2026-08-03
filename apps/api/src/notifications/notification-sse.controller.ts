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

      const cleanup = () => {
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

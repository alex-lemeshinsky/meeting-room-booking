import { EventEmitter2 } from "@nestjs/event-emitter";
import type { MessageEvent } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Subscription } from "rxjs";
import type { AuthenticatedRequest } from "../../src/auth/auth.types.js";
import {
  NotificationSseController,
  SSE_HEARTBEAT_INTERVAL_MS
} from "../../src/notifications/notification-sse.controller.js";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOTIFICATION_ID = "40000000-0000-4000-8000-000000000001";

function createRequest(): AuthenticatedRequest {
  return {
    auth: { user: { id: USER_ID } },
    on: vi.fn(),
    removeListener: vi.fn()
  } as unknown as AuthenticatedRequest;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationSseController", () => {
  it("emits periodic heartbeats so idle streams are never closed by proxies", () => {
    vi.useFakeTimers();
    const emitter = new EventEmitter2();
    const controller = new NotificationSseController(emitter);
    const received: MessageEvent[] = [];

    const subscription: Subscription = controller
      .events(createRequest())
      .subscribe((event) => received.push(event));

    expect(received).toHaveLength(0);

    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);
    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("heartbeat");

    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);
    expect(received).toHaveLength(2);

    subscription.unsubscribe();
  });

  it("keeps the heartbeat under the 60s default proxy read timeout", () => {
    expect(SSE_HEARTBEAT_INTERVAL_MS).toBeLessThan(60_000);
  });

  it("stops heartbeats once the client disconnects", () => {
    vi.useFakeTimers();
    const emitter = new EventEmitter2();
    const controller = new NotificationSseController(emitter);
    const received: MessageEvent[] = [];

    const subscription = controller
      .events(createRequest())
      .subscribe((event) => received.push(event));

    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS);
    expect(received).toHaveLength(1);

    subscription.unsubscribe();
    vi.advanceTimersByTime(SSE_HEARTBEAT_INTERVAL_MS * 3);

    expect(received).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still delivers notification events for the subscribed user only", () => {
    vi.useFakeTimers();
    const emitter = new EventEmitter2();
    const controller = new NotificationSseController(emitter);
    const received: MessageEvent[] = [];

    const subscription = controller
      .events(createRequest())
      .subscribe((event) => received.push(event));

    emitter.emit("notification.created", {
      userId: "00000000-0000-4000-8000-000000000002",
      notificationId: NOTIFICATION_ID
    });
    expect(received).toHaveLength(0);

    emitter.emit("notification.created", {
      userId: USER_ID,
      notificationId: NOTIFICATION_ID
    });
    expect(received).toHaveLength(1);
    expect(received[0]?.data).toBe(
      JSON.stringify({ type: "notification", id: NOTIFICATION_ID })
    );

    subscription.unsubscribe();
  });
});

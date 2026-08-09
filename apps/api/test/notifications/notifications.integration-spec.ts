import { FixedClock } from "@mrb/time";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const APP_ORIGIN = "http://127.0.0.1:3000";
const NOW = new Date("2026-08-03T10:55:00.000Z");
const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const OLENA_ID = "00000000-0000-4000-8000-000000000001";
const ALEX_ID = "00000000-0000-4000-8000-000000000002";
const BOOKING_1_ID = "30000000-0000-4000-8000-000000000091";
const BOOKING_2_ID = "30000000-0000-4000-8000-000000000092";

interface AuthenticatedAgent {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  cookieHeader: string;
}

describe("Notifications API & SSE integration", () => {
  let context: PostgresTestApp;
  let database: DatabaseService;
  let olena: AuthenticatedAgent;
  let alex: AuthenticatedAgent;
  let baseUrl: string;

  beforeAll(async () => {
    context = await startPostgresTestApp({
      seed: true,
      clock: new FixedClock(NOW)
    });
    database = context.app.get(DatabaseService);
    baseUrl = await listen(context.app.getHttpServer() as Server);
    olena = await login(context, "olena@example.com", "Rooms123!");
    alex = await login(context, "alex@example.com", "Meeting123!");
  }, 120_000);

  beforeEach(async () => {
    await database.notification.deleteMany();
    await database.booking.deleteMany({
      where: { id: { in: [BOOKING_1_ID, BOOKING_2_ID] } }
    });

    await database.booking.createMany({
      data: [
        {
          id: BOOKING_1_ID,
          roomId: ROOM_ID,
          userId: OLENA_ID,
          title: "Olena Current Meeting",
          startAt: new Date("2026-08-03T10:00:00.000Z"),
          endAt: new Date("2026-08-03T11:00:00.000Z")
        },
        {
          id: BOOKING_2_ID,
          roomId: ROOM_ID,
          userId: ALEX_ID,
          title: "Alex Next Meeting",
          startAt: new Date("2026-08-03T11:00:00.000Z"),
          endAt: new Date("2026-08-03T12:00:00.000Z")
        }
      ]
    });
  });

  afterAll(async () => context?.stop());

  describe("GET /api/v1/notifications", () => {
    it("requires an authenticated session", async () => {
      await request(context.app.getHttpServer())
        .get("/api/v1/notifications")
        .expect(401);
    });

    it("returns notifications list and unread count for authenticated user", async () => {
      const notif = await database.notification.create({
        data: {
          userId: OLENA_ID,
          currentBookingId: BOOKING_1_ID,
          nextBookingId: BOOKING_2_ID,
          type: "NEXT_BOOKING_STARTS",
          message: "Meeting starting in 10 minutes",
          roomName: "Berlin",
          scheduledFor: new Date("2026-08-03T10:50:00.000Z")
        }
      });

      const response = await olena.agent
        .get("/api/v1/notifications")
        .expect(200);

      expect(response.body).toEqual({
        notifications: [
          {
            id: notif.id,
            type: "NEXT_BOOKING_STARTS",
            message: "Meeting starting in 10 minutes",
            roomName: "Berlin",
            currentBookingId: BOOKING_1_ID,
            nextBookingId: BOOKING_2_ID,
            scheduledFor: "2026-08-03T10:50:00.000Z",
            createdAt: expect.any(String),
            readAt: null
          }
        ],
        unreadCount: 1
      });

      const alexResponse = await alex.agent
        .get("/api/v1/notifications")
        .expect(200);
      expect(alexResponse.body).toEqual({
        notifications: [],
        unreadCount: 0
      });
    });

    it.each([
      ["the current booking", BOOKING_1_ID],
      ["the next booking", BOOKING_2_ID]
    ])(
      "withholds a persisted notification once %s is cancelled",
      async (_case, cancelledBookingId) => {
        await database.notification.create({
          data: {
            userId: OLENA_ID,
            currentBookingId: BOOKING_1_ID,
            nextBookingId: BOOKING_2_ID,
            type: "NEXT_BOOKING_STARTS",
            message: "Meeting starting in 10 minutes",
            roomName: "Berlin",
            scheduledFor: new Date("2026-08-03T10:50:00.000Z")
          }
        });

        await expect(
          olena.agent.get("/api/v1/notifications").expect(200)
        ).resolves.toMatchObject({ body: { unreadCount: 1 } });

        await database.booking.update({
          where: { id: cancelledBookingId },
          data: { status: "CANCELLED", cancelledAt: NOW }
        });

        const response = await olena.agent
          .get("/api/v1/notifications")
          .expect(200);

        expect(response.body).toEqual({ notifications: [], unreadCount: 0 });
      }
    );
  });

  describe("PATCH /api/v1/notifications/:id/read", () => {
    it("requires authentication and CSRF token", async () => {
      const notif = await database.notification.create({
        data: {
          userId: OLENA_ID,
          currentBookingId: BOOKING_1_ID,
          nextBookingId: BOOKING_2_ID,
          type: "NEXT_BOOKING_STARTS",
          message: "Meeting starting in 10 minutes",
          roomName: "Berlin",
          scheduledFor: new Date("2026-08-03T10:50:00.000Z")
        }
      });

      await request(context.app.getHttpServer())
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set("Origin", APP_ORIGIN)
        .send({})
        .expect(401);

      await olena.agent
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set("Origin", APP_ORIGIN)
        .set("X-CSRF-Token", "invalid-csrf")
        .send({})
        .expect(403);
    });

    it("marks notification as read for owner and returns 200", async () => {
      const notif = await database.notification.create({
        data: {
          userId: OLENA_ID,
          currentBookingId: BOOKING_1_ID,
          nextBookingId: BOOKING_2_ID,
          type: "NEXT_BOOKING_STARTS",
          message: "Meeting starting in 10 minutes",
          roomName: "Berlin",
          scheduledFor: new Date("2026-08-03T10:50:00.000Z")
        }
      });

      const response = await olena.agent
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set("Origin", APP_ORIGIN)
        .set("X-CSRF-Token", olena.csrfToken)
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        notification: {
          id: notif.id,
          readAt: NOW.toISOString()
        }
      });

      const updated = await database.notification.findUnique({
        where: { id: notif.id }
      });
      expect(updated?.readAt).toEqual(NOW);
    });

    it("returns 404 when trying to mark another user's notification as read", async () => {
      const notif = await database.notification.create({
        data: {
          userId: ALEX_ID,
          currentBookingId: BOOKING_1_ID,
          nextBookingId: BOOKING_2_ID,
          type: "NEXT_BOOKING_STARTS",
          message: "Alex notification",
          roomName: "Berlin",
          scheduledFor: new Date("2026-08-03T10:50:00.000Z")
        }
      });

      const response = await olena.agent
        .patch(`/api/v1/notifications/${notif.id}/read`)
        .set("Origin", APP_ORIGIN)
        .set("X-CSRF-Token", olena.csrfToken)
        .send({})
        .expect(404);

      expect(response.body.error).toMatchObject({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found"
      });
    });
  });

  describe("GET /events SSE stream", () => {
    it("requires an authenticated session", async () => {
      await request(context.app.getHttpServer()).get("/events").expect(401);
    });

    // The stream stays open by design, so this asserts on response headers and
    // aborts; awaiting the response body would hang until the test times out.
    it("returns text/event-stream headers for authenticated user", async () => {
      const controller = new AbortController();

      try {
        const response = await fetch(`${baseUrl}/events`, {
          headers: {
            accept: "text/event-stream",
            cookie: olena.cookieHeader
          },
          signal: controller.signal
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(
          /text\/event-stream/
        );
      } finally {
        controller.abort();
      }
    });
  });
});

async function login(
  context: PostgresTestApp,
  email: string,
  password: string
): Promise<AuthenticatedAgent> {
  const agent = request.agent(context.app.getHttpServer());
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", APP_ORIGIN)
    .send({ email, password })
    .expect(200);

  return {
    agent,
    csrfToken: cookieValue(cookie(response, "mrb_csrf")),
    cookieHeader: cookieHeader(response)
  };
}

async function listen(server: Server): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
  }

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function cookieHeader(response: request.Response): string {
  const setCookie = response.headers["set-cookie"];
  const cookieHeaders = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];

  return cookieHeaders
    .map((item) => item.slice(0, item.indexOf(";")))
    .join("; ");
}

function cookie(response: request.Response, name: string): string {
  const setCookie = response.headers["set-cookie"];
  const cookieHeaders = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const value = cookieHeaders.find((item) => item.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

function cookieValue(cookieHeader: string): string {
  return cookieHeader.slice(
    cookieHeader.indexOf("=") + 1,
    cookieHeader.indexOf(";")
  );
}

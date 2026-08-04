import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/database/database.service.js";
import { NotificationSchedulerService } from "../../src/notifications/notification-scheduler.service.js";
import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";

const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const USER_1_ID = "00000000-0000-4000-8000-000000000001";
const USER_2_ID = "00000000-0000-4000-8000-000000000002";

describe("NotificationSchedulerService (Integration)", () => {
  let context: PostgresTestApp;
  let database: DatabaseService;
  let mutableClock: { nowTime: Date; now: () => Date };
  let previousNotifyBeforeMinutes: string | undefined;

  beforeAll(async () => {
    // Pin the window so a local .env cannot change the asserted message.
    previousNotifyBeforeMinutes = process.env.NOTIFY_BEFORE_MINUTES;
    process.env.NOTIFY_BEFORE_MINUTES = "10";

    mutableClock = {
      nowTime: new Date("2035-01-15T10:00:00.000Z"),
      now() {
        return this.nowTime;
      }
    };

    context = await startPostgresTestApp({
      seed: true,
      clock: mutableClock
    });
    database = context.app.get(DatabaseService);
  }, 120_000);

  beforeEach(async () => {
    await database.notification.deleteMany();
    await database.booking.deleteMany();
    await database.bookingSeries.deleteMany();
  });

  afterAll(async () => {
    await context.stop();

    if (previousNotifyBeforeMinutes === undefined) {
      delete process.env.NOTIFY_BEFORE_MINUTES;
    } else {
      process.env.NOTIFY_BEFORE_MINUTES = previousNotifyBeforeMinutes;
    }
  });

  it("detects back-to-back bookings within notification window, creates DB notification, is idempotent, and skips cancelled bookings", async () => {
    const scheduler = context.app.get(NotificationSchedulerService);

    // 1. Seed back-to-back bookings in same room
    const currentBooking = await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: USER_1_ID,
        title: "Планування спринту",
        startAt: new Date("2035-01-15T10:00:00.000Z"),
        endAt: new Date("2035-01-15T10:30:00.000Z"),
        status: "ACTIVE"
      }
    });

    const nextBooking = await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: USER_2_ID,
        title: "Огляд дизайну",
        startAt: new Date("2035-01-15T10:30:00.000Z"),
        endAt: new Date("2035-01-15T11:00:00.000Z"),
        status: "ACTIVE"
      }
    });

    // 2. Advance clock to endAt - 5 minutes (10:25)
    mutableClock.nowTime = new Date("2035-01-15T10:25:00.000Z");

    // 3. Call processNotifications(). Assert 1 notification row created in DB.
    const createdCount1 = await scheduler.processNotifications();
    expect(createdCount1).toBe(1);

    const notificationsInDb = await database.notification.findMany({
      where: {
        currentBookingId: currentBooking.id,
        nextBookingId: nextBooking.id
      }
    });
    expect(notificationsInDb).toHaveLength(1);
    const targetNotification = notificationsInDb[0]!;
    expect(targetNotification.userId).toBe(USER_1_ID);
    expect(targetNotification.type).toBe("NEXT_BOOKING_STARTS");
    expect(targetNotification.message).toBe(
      "«Планування спринту» у Арсенал завершується за 10 хв — наступне бронювання починається одразу"
    );

    // 4. Run processNotifications() again. Assert 0 new notifications (idempotent).
    const createdCount2 = await scheduler.processNotifications();
    expect(createdCount2).toBe(0);

    const totalNotifications = await database.notification.count();
    expect(totalNotifications).toBe(1);

    // 5. Test pair where next booking is CANCELLED
    const pair2Current = await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: USER_1_ID,
        title: "Демо",
        startAt: new Date("2035-01-15T12:00:00.000Z"),
        endAt: new Date("2035-01-15T12:30:00.000Z"),
        status: "ACTIVE"
      }
    });

    const pair2Next = await database.booking.create({
      data: {
        roomId: ROOM_ID,
        userId: USER_2_ID,
        title: "Ретроспектива",
        startAt: new Date("2035-01-15T12:30:00.000Z"),
        endAt: new Date("2035-01-15T13:00:00.000Z"),
        status: "CANCELLED",
        cancelledAt: new Date("2035-01-15T12:10:00.000Z")
      }
    });

    // Advance clock to endAt - 5 minutes for pair 2 (12:25)
    mutableClock.nowTime = new Date("2035-01-15T12:25:00.000Z");

    const createdCount3 = await scheduler.processNotifications();
    expect(createdCount3).toBe(0);

    const pair2Notifications = await database.notification.findMany({
      where: {
        currentBookingId: pair2Current.id,
        nextBookingId: pair2Next.id
      }
    });
    expect(pair2Notifications).toHaveLength(0);
  });
});

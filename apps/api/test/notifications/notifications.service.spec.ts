import { FixedClock } from "@mrb/time";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import { NotificationsService } from "../../src/notifications/notifications.service.js";

const NOW = new Date("2026-08-03T10:55:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOTIF_ID = "40000000-0000-4000-8000-000000000001";

describe("NotificationsService", () => {
  function createMockDatabase(
    findManyMock: unknown,
    countMock: unknown,
    findFirstMock?: unknown,
    updateMock?: unknown
  ): DatabaseService {
    return {
      notification: {
        findMany: findManyMock ?? vi.fn(),
        count: countMock ?? vi.fn(),
        findFirst: findFirstMock ?? vi.fn(),
        update: updateMock ?? vi.fn()
      }
    } as unknown as DatabaseService;
  }

  describe("listForUser", () => {
    it("fetches latest 50 notifications and unread count, formatting DTO items", async () => {
      const mockNotifications = [
        {
          id: NOTIF_ID,
          userId: USER_ID,
          currentBookingId: "30000000-0000-4000-8000-000000000001",
          nextBookingId: "30000000-0000-4000-8000-000000000002",
          type: "NEXT_BOOKING_STARTS",
          message: "Meeting starting soon",
          roomName: "Berlin",
          scheduledFor: new Date("2026-08-03T10:50:00.000Z"),
          createdAt: new Date("2026-08-03T10:50:01.000Z"),
          readAt: null
        }
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockNotifications);
      const countMock = vi.fn().mockResolvedValue(1);
      const database = createMockDatabase(findManyMock, countMock);
      const service = new NotificationsService(database, new FixedClock(NOW));

      const result = await service.listForUser(USER_ID);

      expect(findManyMock).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: "desc" },
        take: 50
      });
      expect(countMock).toHaveBeenCalledWith({
        where: { userId: USER_ID, readAt: null }
      });
      expect(result).toEqual({
        notifications: [
          {
            id: NOTIF_ID,
            type: "NEXT_BOOKING_STARTS",
            message: "Meeting starting soon",
            roomName: "Berlin",
            currentBookingId: "30000000-0000-4000-8000-000000000001",
            nextBookingId: "30000000-0000-4000-8000-000000000002",
            scheduledFor: "2026-08-03T10:50:00.000Z",
            createdAt: "2026-08-03T10:50:01.000Z",
            readAt: null
          }
        ],
        unreadCount: 1
      });
    });
  });

  describe("markAsRead", () => {
    it("throws 404 AppError if notification is not found for user", async () => {
      const findFirstMock = vi.fn().mockResolvedValue(null);
      const database = createMockDatabase(null, null, findFirstMock);
      const service = new NotificationsService(database, new FixedClock(NOW));

      await expect(service.markAsRead(USER_ID, NOTIF_ID)).rejects.toThrow(
        AppError
      );
      await expect(service.markAsRead(USER_ID, NOTIF_ID)).rejects.toMatchObject(
        {
          status: 404,
          code: "NOTIFICATION_NOT_FOUND"
        }
      );
    });

    it("marks unread notification as read using current clock time", async () => {
      const existingNotif = {
        id: NOTIF_ID,
        userId: USER_ID,
        readAt: null
      };
      const findFirstMock = vi.fn().mockResolvedValue(existingNotif);
      const updateMock = vi.fn().mockResolvedValue({
        id: NOTIF_ID,
        readAt: NOW
      });

      const database = createMockDatabase(
        null,
        null,
        findFirstMock,
        updateMock
      );
      const service = new NotificationsService(database, new FixedClock(NOW));

      const result = await service.markAsRead(USER_ID, NOTIF_ID);

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { id: NOTIF_ID, userId: USER_ID }
      });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: NOTIF_ID },
        data: { readAt: NOW }
      });
      expect(result).toEqual({
        notification: {
          id: NOTIF_ID,
          readAt: NOW.toISOString()
        }
      });
    });

    it("returns existing readAt if notification was already read without performing update", async () => {
      const alreadyReadDate = new Date("2026-08-03T10:52:00.000Z");
      const existingNotif = {
        id: NOTIF_ID,
        userId: USER_ID,
        readAt: alreadyReadDate
      };
      const findFirstMock = vi.fn().mockResolvedValue(existingNotif);
      const updateMock = vi.fn();

      const database = createMockDatabase(
        null,
        null,
        findFirstMock,
        updateMock
      );
      const service = new NotificationsService(database, new FixedClock(NOW));

      const result = await service.markAsRead(USER_ID, NOTIF_ID);

      expect(updateMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        notification: {
          id: NOTIF_ID,
          readAt: alreadyReadDate.toISOString()
        }
      });
    });
  });
});

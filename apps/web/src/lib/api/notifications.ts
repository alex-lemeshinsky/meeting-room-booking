import { csrfTokenFromCookie } from "../auth/csrf";
import { browserApi } from "./browser";
import type {
  MarkNotificationReadResponse,
  NotificationsResponse
} from "./contracts";

export function fetchNotifications(): Promise<NotificationsResponse> {
  return browserApi<NotificationsResponse>("/api/v1/notifications", {
    method: "GET",
    credentials: "same-origin"
  });
}

export function markNotificationRead(
  id: string
): Promise<MarkNotificationReadResponse> {
  return browserApi<MarkNotificationReadResponse>(
    `/api/v1/notifications/${encodeURIComponent(id)}/read`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "X-CSRF-Token": csrfTokenFromCookie()
      }
    }
  );
}

import { csrfTokenFromCookie } from "../auth/csrf";
import { browserApi } from "./browser";
import type { AuthResponse, UpdateMeBody } from "./contracts";

export function updateWeekStartsOn(
  weekStartsOn: number
): Promise<AuthResponse> {
  const body: UpdateMeBody = { weekStartsOn };

  return browserApi<AuthResponse>("/api/v1/me", {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfTokenFromCookie()
    },
    body: JSON.stringify(body)
  });
}

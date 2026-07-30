import { csrfTokenFromCookie } from "../auth/csrf";
import { browserApi } from "./browser";
import type { CreateBookingBody, CreateBookingResponse } from "./contracts";

export function createBooking(
  input: CreateBookingBody
): Promise<CreateBookingResponse> {
  return browserApi<CreateBookingResponse>("/api/v1/bookings", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfTokenFromCookie()
    },
    body: JSON.stringify(input)
  });
}

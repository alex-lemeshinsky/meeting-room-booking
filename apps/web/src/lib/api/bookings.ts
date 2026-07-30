import { csrfTokenFromCookie } from "../auth/csrf";
import { browserApi } from "./browser";
import type {
  CancelBookingResponse,
  CreateBookingBody,
  CreateBookingResponse,
  MyBookingsResponse
} from "./contracts";

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

export function cancelBooking(
  bookingId: string
): Promise<CancelBookingResponse> {
  return browserApi<CancelBookingResponse>(
    `/api/v1/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfTokenFromCookie()
      },
      body: JSON.stringify({})
    }
  );
}

export function fetchMyBookings(
  section: "upcoming" | "history",
  cursor?: string
): Promise<MyBookingsResponse> {
  const query = new URLSearchParams({ section });
  if (cursor !== undefined) query.set("cursor", cursor);

  return browserApi<MyBookingsResponse>(`/api/v1/my-bookings?${query}`, {
    method: "GET",
    credentials: "same-origin"
  });
}

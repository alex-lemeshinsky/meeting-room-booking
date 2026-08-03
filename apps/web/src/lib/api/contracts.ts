import type { components, operations } from "@mrb/contracts";

export type RegisterBody =
  operations["register"]["requestBody"]["content"]["application/json"];

export type LoginBody =
  operations["login"]["requestBody"]["content"]["application/json"];

export type AuthResponse =
  operations["getSession"]["responses"][200]["content"]["application/json"];

export type VerifyEmailBody =
  operations["verifyEmail"]["requestBody"]["content"]["application/json"];

export type VerifyEmailResponse =
  operations["verifyEmail"]["responses"][200]["content"]["application/json"];

export type RoomsResponse =
  operations["listRooms"]["responses"][200]["content"]["application/json"];

export type ScheduleResponse =
  operations["getRoomSchedule"]["responses"][200]["content"]["application/json"];

export type CreateBookingBody =
  operations["createBooking"]["requestBody"]["content"]["application/json"];

export type CreateBookingResponse =
  operations["createBooking"]["responses"][201]["content"]["application/json"];

export type CancelBookingResponse =
  operations["cancelBooking"]["responses"][200]["content"]["application/json"];

export type MyBookingsResponse =
  operations["listMyBookings"]["responses"][200]["content"]["application/json"];

export type CreateBookingSeriesBody =
  operations["createBookingSeries"]["requestBody"]["content"]["application/json"];

export type CreateBookingSeriesResponse =
  operations["createBookingSeries"]["responses"][201]["content"]["application/json"];

export type CancelBookingSeriesResponse =
  operations["cancelBookingSeries"]["responses"][200]["content"]["application/json"];

export type ApiErrorBody = components["schemas"]["ApiErrorDto"];

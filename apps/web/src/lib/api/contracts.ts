import type { components, operations } from "@mrb/contracts";

export type RegisterBody =
  operations["register"]["requestBody"]["content"]["application/json"];

export type LoginBody =
  operations["login"]["requestBody"]["content"]["application/json"];

export type AuthResponse =
  operations["getSession"]["responses"][200]["content"]["application/json"];

export type RoomsResponse =
  operations["listRooms"]["responses"][200]["content"]["application/json"];

export type ApiErrorBody = components["schemas"]["ApiErrorDto"];

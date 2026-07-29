import "server-only";
import { cookies } from "next/headers";
import type { AuthResponse, RoomsResponse } from "../api/contracts";
import { serverApi, UnauthenticatedError } from "../api/server";
import { SESSION_COOKIE } from "./cookies";

async function currentSessionSecret(): Promise<string> {
  const cookieStore = await cookies();
  const sessionSecret = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionSecret) {
    throw new UnauthenticatedError();
  }

  return sessionSecret;
}

export async function getCurrentSession(): Promise<AuthResponse> {
  return serverApi<AuthResponse>(
    "/api/v1/auth/session",
    await currentSessionSecret()
  );
}

export async function getRooms(): Promise<RoomsResponse> {
  return serverApi<RoomsResponse>(
    "/api/v1/rooms",
    await currentSessionSecret()
  );
}

export async function getRoom(
  roomId: string
): Promise<RoomsResponse["rooms"][number] | undefined> {
  const { rooms } = await getRooms();
  return rooms.find((room) => room.id === roomId);
}

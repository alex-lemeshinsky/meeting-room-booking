import "server-only";
import { SESSION_COOKIE } from "../auth/cookies";

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Session is not authenticated.");
    this.name = "UnauthenticatedError";
  }
}

export async function serverApi<TResponse>(
  path: string,
  sessionSecret: string
): Promise<TResponse> {
  const response = await fetch(`${apiInternalUrl}${path}`, {
    headers: {
      Cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionSecret)}`
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    throw new UnauthenticatedError();
  }

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`);
  }

  return (await response.json()) as TResponse;
}

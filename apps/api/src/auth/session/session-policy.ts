const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionWindow {
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export function calculateSessionWindow(now: Date): SessionWindow {
  const nowMs = now.getTime();

  return {
    lastSeenAt: new Date(nowMs),
    idleExpiresAt: new Date(nowMs + SESSION_IDLE_MS),
    absoluteExpiresAt: new Date(nowMs + SESSION_ABSOLUTE_MS)
  };
}

export function calculateNextIdleExpiry(
  now: Date,
  absoluteExpiresAt: Date
): Date {
  return new Date(
    Math.min(now.getTime() + SESSION_IDLE_MS, absoluteExpiresAt.getTime())
  );
}

export function isSessionExpired(
  now: Date,
  idleExpiresAt: Date,
  absoluteExpiresAt: Date
): boolean {
  const nowMs = now.getTime();

  return (
    nowMs >= idleExpiresAt.getTime() || nowMs >= absoluteExpiresAt.getTime()
  );
}

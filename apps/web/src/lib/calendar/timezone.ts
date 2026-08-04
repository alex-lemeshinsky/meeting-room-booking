import { isValidTimezone } from "@mrb/time/calendar";

const FALLBACK_TIMEZONE = "Europe/Kyiv";
export const TIMEZONE_COOKIE = "mrb_timezone";
const COOKIE_MAX_AGE_SECONDS = 31_536_000;

export function detectBrowserTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimezone(timezone) ? timezone : FALLBACK_TIMEZONE;
}

export function persistBrowserTimezoneCookie(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new RangeError(`timezone must be a valid IANA zone: ${timezone}`);
  }

  document.cookie =
    `${TIMEZONE_COOKIE}=${encodeURIComponent(timezone)}; ` +
    `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

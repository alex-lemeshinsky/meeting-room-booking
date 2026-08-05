import { isValidTimezone } from "@mrb/time/calendar";

const FALLBACK_TIMEZONE = "Europe/Kyiv";
export const TIMEZONE_COOKIE = "mrb_timezone";
const COOKIE_MAX_AGE_SECONDS = 31_536_000;

// Some ICU builds still resolve the browser's zone to the pre-2022 tzdata
// alias, which reads as an inconsistency next to the "Europe/Kyiv" office
// zone shown in the same banner.
const LEGACY_TIMEZONE_ALIASES: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv"
};

export function detectBrowserTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const normalized = LEGACY_TIMEZONE_ALIASES[timezone] ?? timezone;
  return isValidTimezone(normalized) ? normalized : FALLBACK_TIMEZONE;
}

export function persistBrowserTimezoneCookie(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new RangeError(`timezone must be a valid IANA zone: ${timezone}`);
  }

  document.cookie =
    `${TIMEZONE_COOKIE}=${encodeURIComponent(timezone)}; ` +
    `Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

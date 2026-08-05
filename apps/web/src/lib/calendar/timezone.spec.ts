import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectBrowserTimezone,
  persistBrowserTimezoneCookie
} from "./timezone";

function mockResolvedTimezone(timezone: string) {
  vi.spyOn(
    Intl.DateTimeFormat.prototype,
    "resolvedOptions"
  ).mockReturnValueOnce({
    locale: "en-US",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = "mrb_timezone=; Path=/; Max-Age=0; SameSite=Lax";
});

describe("browser timezone", () => {
  it("uses a valid browser IANA zone", () => {
    mockResolvedTimezone("America/New_York");

    expect(detectBrowserTimezone()).toBe("America/New_York");
  });

  it.each(["", "+02:00", "Not/A_Zone"])(
    "falls back to Kyiv for the invalid browser zone %j",
    (timezone) => {
      mockResolvedTimezone(timezone);

      expect(detectBrowserTimezone()).toBe("Europe/Kyiv");
    }
  );

  it("normalizes the legacy Europe/Kiev alias to Europe/Kyiv", () => {
    mockResolvedTimezone("Europe/Kiev");

    expect(detectBrowserTimezone()).toBe("Europe/Kyiv");
  });

  it("persists the encoded non-secret timezone cookie", () => {
    persistBrowserTimezoneCookie("America/New_York");

    expect(document.cookie).toContain("mrb_timezone=America%2FNew_York");
  });
});

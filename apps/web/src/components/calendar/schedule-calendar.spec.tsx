import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleResponse } from "../../lib/api/contracts";
import { ScheduleCalendar } from "./schedule-calendar";

const router = {
  push: vi.fn(),
  replace: vi.fn()
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/rooms/room-1",
  useRouter: () => router
}));

vi.mock("../../lib/calendar/timezone", () => ({
  detectBrowserTimezone: () => "Europe/Kyiv",
  persistBrowserTimezoneCookie: () => undefined
}));

const room = {
  id: "room-1",
  name: "Дніпро",
  floor: 4,
  capacity: 10
};

function scheduleResponse(weekStart = "2026-07-27"): ScheduleResponse {
  if (weekStart === "2026-08-03") {
    return {
      room,
      from: "2026-08-02T21:00:00.000Z",
      to: "2026-08-09T21:00:00.000Z",
      bookings: []
    };
  }

  return {
    room,
    from: "2026-07-26T21:00:00.000Z",
    to: "2026-08-02T21:00:00.000Z",
    bookings: []
  };
}

function apiSuccess(body: ScheduleResponse) {
  return {
    ok: true,
    json: async () => body
  } as Response;
}

function apiError(code: string) {
  return {
    ok: false,
    json: async () => ({
      error: {
        code,
        message: "Request failed",
        requestId: "request-123"
      }
    })
  } as Response;
}

function renderSchedule(initialWeekStart = "2026-07-27") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  const calendar = (weekStart: string) => (
    <QueryClientProvider client={queryClient}>
      <ScheduleCalendar room={room} initialWeekStart={weekStart} />
    </QueryClientProvider>
  );
  const view = render(calendar(initialWeekStart));

  return {
    queryClient,
    rerenderWeek: (weekStart: string) => view.rerender(calendar(weekStart))
  };
}

afterEach(() => {
  cleanup();
  router.push.mockReset();
  router.replace.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ScheduleCalendar", () => {
  it("server-renders stable calendar skeleton geometry before timezone detection", () => {
    const queryClient = new QueryClient();

    const html = renderToString(
      <QueryClientProvider client={queryClient}>
        <ScheduleCalendar room={room} initialWeekStart="2026-07-27" />
      </QueryClientProvider>
    );

    expect(html).toContain("data-calendar-skeleton");
    expect(html).toContain("Завантажуємо розклад");
    expect(html).not.toContain("Ваш часовий пояс:");
  });

  it("loads through the exact weekly query key, bounds, and same-origin request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiSuccess(scheduleResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient } = renderSchedule();

    expect(screen.getByLabelText("Завантажуємо розклад")).toBeVisible();
    expect(await screen.findByText("Оберіть вільний слот")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/rooms/room-1/schedule" +
        "?from=2026-07-26T21%3A00%3A00.000Z" +
        "&to=2026-08-02T21%3A00%3A00.000Z",
      {
        method: "GET",
        credentials: "same-origin"
      }
    );
    expect(
      queryClient.getQueryState([
        "schedule",
        "room-1",
        "2026-07-27",
        "Europe/Kyiv"
      ])?.status
    ).toBe("success");
  });

  it("writes the next local Monday to the room URL and retains the prior grid while updating", async () => {
    let resolveNext: ((response: Response) => void) | undefined;
    const nextResponse = new Promise<Response>((resolve) => {
      resolveNext = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiSuccess(scheduleResponse()))
      .mockReturnValueOnce(nextResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { rerenderWeek } = renderSchedule();
    await screen.findByText("Оберіть вільний слот");

    await user.click(screen.getByRole("button", { name: "Наступний тиждень" }));

    expect(router.push).toHaveBeenCalledWith("/rooms/room-1?week=2026-08-03");
    rerenderWeek("2026-08-03");
    expect(screen.getByText("Оберіть вільний слот")).toBeVisible();
    expect(await screen.findByText("Оновлюємо розклад")).toBeVisible();

    await act(async () => {
      resolveNext?.(apiSuccess(scheduleResponse("2026-08-03")));
      await nextResponse;
    });

    await waitFor(() => {
      expect(screen.queryByText("Оновлюємо розклад")).not.toBeInTheDocument();
    });
  });

  it("treats a changed URL-derived week prop as authoritative", async () => {
    let resolveNext: ((response: Response) => void) | undefined;
    const nextResponse = new Promise<Response>((resolve) => {
      resolveNext = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiSuccess(scheduleResponse()))
      .mockReturnValueOnce(nextResponse);
    vi.stubGlobal("fetch", fetchMock);
    const { rerenderWeek } = renderSchedule();
    await screen.findByText("Оберіть вільний слот");

    rerenderWeek("2026-08-03");

    expect(await screen.findByText("Оновлюємо розклад")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/rooms/room-1/schedule" +
        "?from=2026-08-02T21%3A00%3A00.000Z" +
        "&to=2026-08-09T21%3A00%3A00.000Z",
      {
        method: "GET",
        credentials: "same-origin"
      }
    );

    await act(async () => {
      resolveNext?.(apiSuccess(scheduleResponse("2026-08-03")));
      await nextResponse;
    });
  });

  it("refreshes now geometry on a bounded timer", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval"]
    });
    vi.setSystemTime(new Date("2026-07-29T07:29:30.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiSuccess(scheduleResponse()))
    );
    renderSchedule();

    expect(
      await screen.findByTestId("calendar-day-header-2026-07-29")
    ).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId("now-indicator")).toHaveAttribute(
      "data-slot-id",
      "2026-07-29T07:00:00.000Z"
    );

    vi.setSystemTime(new Date("2026-07-29T07:30:30.000Z"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("now-indicator")).toHaveAttribute(
      "data-slot-id",
      "2026-07-29T07:30:00.000Z"
    );
  });

  it("refreshes the current local day across midnight", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval"]
    });
    vi.setSystemTime(new Date("2026-07-29T20:59:30.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiSuccess(scheduleResponse()))
    );
    renderSchedule();

    expect(
      await screen.findByTestId("calendar-day-header-2026-07-29")
    ).toHaveAttribute("aria-current", "date");

    vi.setSystemTime(new Date("2026-07-29T21:00:30.000Z"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(
      screen.getByTestId("calendar-day-header-2026-07-30")
    ).toHaveAttribute("aria-current", "date");
    expect(screen.queryByTestId("now-indicator")).not.toBeInTheDocument();
  });

  it("shows inline errors and retries on request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(apiError("HTTP_ERROR"))
      .mockResolvedValueOnce(apiSuccess(scheduleResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSchedule();

    expect(
      await screen.findByRole("heading", {
        name: "Не вдалося завантажити розклад"
      })
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Спробувати ще" }));

    expect(await screen.findByText("Оберіть вільний слот")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redirects unauthenticated query failures to the session login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("UNAUTHENTICATED"))
    );
    renderSchedule();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login?reason=session");
    });
    expect(
      screen.queryByRole("heading", {
        name: "Не вдалося завантажити розклад"
      })
    ).not.toBeInTheDocument();
  });
});

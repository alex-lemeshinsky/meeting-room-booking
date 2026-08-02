import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyBookingsResponse } from "../../lib/api/contracts";
import { MyBookingsPage } from "./my-bookings-page";

afterEach(() => {
  cleanup();
  document.cookie = "mrb_csrf=; Max-Age=0; path=/";
  vi.unstubAllGlobals();
});

describe("MyBookingsPage", () => {
  it("shows active and upcoming rows with separate calendar and cancellation actions", () => {
    renderPage({
      bookings: [
        booking({
          id: "booking-active",
          title: "Щоденна координація",
          state: "ACTIVE"
        }),
        booking({
          id: "booking-upcoming",
          title: "Планування спринту",
          state: "UPCOMING",
          startAt: "2026-07-27T08:00:00.000Z",
          endAt: "2026-07-27T08:30:00.000Z"
        })
      ],
      nextCursor: null
    });

    expect(screen.getByRole("tab", { name: "Майбутні (2)" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("Триває зараз")).toBeVisible();
    expect(screen.getByText("Майбутнє")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Відкрити бронювання «Планування спринту» в календарі/
      })
    ).toHaveAttribute(
      "href",
      "/rooms/10000000-0000-4000-8000-000000000001?week=2026-07-27"
    );
    expect(
      screen.getAllByRole("button", { name: /Скасувати бронювання/ })
    ).toHaveLength(2);
  });

  it("loads history lazily and appends cursor pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        apiSuccess({
          bookings: [
            booking({
              id: "history-1",
              title: "Завершена зустріч",
              state: "COMPLETED"
            })
          ],
          nextCursor: "next-page"
        })
      )
      .mockResolvedValueOnce(
        apiSuccess({
          bookings: [
            booking({
              id: "history-2",
              title: "Скасована зустріч",
              state: "CANCELLED"
            })
          ],
          nextCursor: null
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage(emptyResponse());

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Історія" }));
    expect(await screen.findByText("Завершена зустріч")).toBeVisible();
    expect(screen.getByText("Завершено")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Завантажити ще" }));
    expect(await screen.findByText("Скасована зустріч")).toBeVisible();
    expect(screen.getByText("Скасовано")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Завантажити ще" })
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/my-bookings?section=history",
      { method: "GET", credentials: "same-origin" }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/my-bookings?section=history&cursor=next-page",
      { method: "GET", credentials: "same-origin" }
    );
  });

  it("selects and focuses adjacent tabs with standard keyboard controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiSuccess(emptyResponse()))
    );
    const user = userEvent.setup();
    renderPage(emptyResponse());
    const upcoming = screen.getByRole("tab", { name: "Майбутні (0)" });
    const history = screen.getByRole("tab", { name: "Історія" });

    upcoming.focus();
    await user.keyboard("{ArrowRight}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(upcoming).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{Home}");
    expect(upcoming).toHaveFocus();
    expect(upcoming).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(upcoming).toHaveFocus();
    expect(upcoming).toHaveAttribute("aria-selected", "true");
  });

  it("distinguishes upcoming and history empty states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiSuccess(emptyResponse()))
    );
    const user = userEvent.setup();
    renderPage(emptyResponse());

    expect(
      screen.getByRole("heading", { name: "Немає майбутніх бронювань" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Перейти до кімнат" })
    ).toHaveAttribute("href", "/rooms");

    await user.click(screen.getByRole("tab", { name: "Історія" }));
    expect(
      await screen.findByRole("heading", { name: "Історія порожня" })
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Перейти до кімнат" })
    ).not.toBeInTheDocument();
  });

  it("cancels once, refreshes server data, and moves focus to the updated panel", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    let resolveCancellation: ((response: Response) => void) | undefined;
    const cancellation = new Promise<Response>((resolve) => {
      resolveCancellation = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => cancellation)
      .mockResolvedValueOnce(apiSuccess(emptyResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage({
      bookings: [booking({ title: "Скасувати мене" })],
      nextCursor: null
    });

    await user.click(
      screen.getByRole("button", {
        name: "Скасувати бронювання «Скасувати мене»"
      })
    );
    const dialog = screen.getByRole("dialog", {
      name: "Скасувати бронювання"
    });
    expect(
      within(dialog).getByRole("button", { name: "Залишити бронювання" })
    ).toHaveFocus();

    await user.click(
      within(dialog).getByRole("button", { name: "Скасувати бронювання" })
    );
    expect(
      within(dialog).getByRole("button", { name: "Скасовуємо…" })
    ).toBeDisabled();
    resolveCancellation?.(
      apiSuccess({
        booking: {
          id: "booking-1",
          status: "CANCELLED",
          cancelledAt: "2026-07-27T06:00:00.000Z"
        }
      })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Скасувати бронювання" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Бронювання «Скасувати мене» скасовано."
    );
    expect(
      screen.getByRole("tabpanel", { name: "Майбутні (0)" })
    ).toHaveFocus();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/bookings/booking-1/cancel",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-value"
        },
        body: JSON.stringify({})
      }
    );
  });

  it("keeps the dialog open and focuses a recoverable cancellation error", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("BOOKING_ALREADY_ENDED"))
    );
    const user = userEvent.setup();
    renderPage({
      bookings: [booking({ title: "Щойно завершилось" })],
      nextCursor: null
    });

    await user.click(
      screen.getByRole("button", {
        name: "Скасувати бронювання «Щойно завершилось»"
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Скасувати бронювання" })
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Це бронювання вже завершилося і його не можна скасувати."
    );
    expect(alert).toHaveFocus();
    expect(
      screen.getByRole("dialog", { name: "Скасувати бронювання" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Скасувати бронювання" })
    ).toBeEnabled();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(
      screen.getByRole("button", { name: "Скасувати бронювання" })
    ).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(
      screen.getByRole("button", { name: "Залишити бронювання" })
    ).toHaveFocus();
  });

  it("returns focus to the cancellation trigger after Escape", async () => {
    const user = userEvent.setup();
    renderPage({
      bookings: [booking({ title: "Залишити зустріч" })],
      nextCursor: null
    });
    const trigger = screen.getByRole("button", {
      name: "Скасувати бронювання «Залишити зустріч»"
    });

    await user.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Скасувати бронювання" })
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });
});

function renderPage(initialUpcoming: MyBookingsResponse) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MyBookingsPage
        initialTimezone="Europe/Kyiv"
        initialUpcoming={initialUpcoming}
      />
    </QueryClientProvider>
  );
}

function emptyResponse(): MyBookingsResponse {
  return { bookings: [], nextCursor: null };
}

function booking(
  overrides: Partial<MyBookingsResponse["bookings"][number]> = {}
): MyBookingsResponse["bookings"][number] {
  return {
    id: "booking-1",
    room: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Арсенал"
    },
    title: "Командне планування",
    startAt: "2026-07-27T06:00:00.000Z",
    endAt: "2026-07-27T06:30:00.000Z",
    state: "UPCOMING",
    seriesId: null,
    occurrenceIndex: null,
    occurrenceCount: null,
    ...overrides
  };
}

function apiSuccess(body: unknown) {
  return { ok: true, json: async () => body } as Response;
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

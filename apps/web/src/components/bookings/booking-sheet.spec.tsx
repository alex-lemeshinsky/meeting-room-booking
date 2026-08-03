import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleResponse } from "../../lib/api/contracts";
import { buildCalendarLayout } from "../../lib/calendar/schedule";
import type { BookingSlotSelection } from "../calendar/calendar-grid";
import { BookingSheet } from "./booking-sheet";

const room = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Арсенал",
  floor: 1,
  capacity: 4
};
const response: ScheduleResponse = {
  room,
  from: "2026-07-26T21:00:00.000Z",
  to: "2026-08-02T21:00:00.000Z",
  bookings: []
};
const layout = buildCalendarLayout({
  response,
  weekStart: "2026-07-27",
  timezone: "Europe/Kyiv",
  now: new Date("2026-07-27T06:15:00.000Z")
});
const selection: BookingSlotSelection = {
  slotId: "2026-07-27T06:30:00.000Z",
  startAt: "2026-07-27T06:30:00.000Z",
  startLabel: "09:30",
  localDate: "2026-07-27",
  fullDateLabel: "понеділок, 27 липня 2026 р."
};

afterEach(() => {
  cleanup();
  document.cookie = "mrb_csrf=; Max-Age=0; path=/";
  vi.unstubAllGlobals();
});

describe("BookingSheet", () => {
  it("opens with calendar context and focuses the title", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog", { name: "Нове бронювання" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      "booking-sheet-description"
    );
    expect(
      screen.getByText(
        "Час показано у вашому часовому поясі. Робочі години перевіряються за часом офісу."
      )
    ).toBeVisible();
    expect(screen.getByDisplayValue("Арсенал")).toBeDisabled();
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-07-27");
    expect(screen.getByLabelText("Початок")).toHaveValue(
      "2026-07-27T06:30:00.000Z"
    );
    expect(screen.getByLabelText("Завершення")).toHaveValue(
      "2026-07-27T07:00:00.000Z"
    );
    expect(screen.getByLabelText("Назва")).toHaveFocus();
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === "P" &&
          element.textContent ===
            "Ваш час: 27.07.2026, 09:30–10:00 (Europe/Kyiv)"
        )
      )
    ).toBeVisible();
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === "P" &&
          element.textContent ===
            "Час офісу: 27.07.2026, 09:30–10:00 (Europe/Kyiv)"
        )
      )
    ).toBeVisible();
  });

  it("locks background scrolling until the sheet unmounts", () => {
    const rendered = renderSheet();

    expect(document.body.style.overflow).toBe("hidden");

    rendered.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("submits the generated booking contract with the CSRF token", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    const fetchMock = vi.fn().mockResolvedValue(
      apiSuccess({
        booking: {
          id: "20000000-0000-4000-8000-000000000001",
          roomId: room.id,
          title: "Планування",
          startAt: selection.startAt,
          endAt: "2026-07-27T07:00:00.000Z"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderSheet({ onCreated });

    await user.type(screen.getByLabelText("Назва"), "Планування");
    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/bookings", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-value"
      },
      body: JSON.stringify({
        roomId: room.id,
        title: "Планування",
        startAt: selection.startAt,
        endAt: "2026-07-27T07:00:00.000Z"
      })
    });
  });

  it("preserves values, refreshes, and focuses the conflict message", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("BOOKING_CONFLICT"))
    );
    const onConflict = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSheet({ onConflict });

    await user.type(screen.getByLabelText("Назва"), "Важлива зустріч");
    await user.selectOptions(
      screen.getByLabelText("Завершення"),
      "2026-07-27T07:30:00.000Z"
    );
    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Цей слот щойно зайняли. Ми оновили розклад. Оберіть інший час."
    );
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Назва")).toHaveValue("Важлива зустріч");
    expect(screen.getByLabelText("Завершення")).toHaveValue(
      "2026-07-27T07:30:00.000Z"
    );
    expect(onConflict).toHaveBeenCalledOnce();
  });

  it("keeps the form open and focused when email verification is required", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiError("EMAIL_NOT_VERIFIED"))
    );
    const onConflict = vi.fn().mockResolvedValue(undefined);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderSheet({ onConflict, onCreated });

    await user.type(screen.getByLabelText("Назва"), "Важлива зустріч");
    await user.selectOptions(
      screen.getByLabelText("Завершення"),
      "2026-07-27T07:30:00.000Z"
    );
    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Підтвердьте email за посиланням із журналу API, щоб створювати бронювання."
    );
    expect(alert).toHaveFocus();
    expect(
      screen.getByRole("dialog", { name: "Нове бронювання" })
    ).toBeVisible();
    expect(screen.getByLabelText("Назва")).toHaveValue("Важлива зустріч");
    expect(screen.getByLabelText("Завершення")).toHaveValue(
      "2026-07-27T07:30:00.000Z"
    );
    expect(screen.getByRole("button", { name: "Забронювати" })).toBeEnabled();
    expect(onConflict).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("keeps the selected date after a refreshed schedule makes it unavailable", () => {
    const refreshedLayout = buildCalendarLayout({
      response,
      weekStart: "2026-07-27",
      timezone: "Europe/Kyiv",
      now: new Date("2026-07-27T16:00:00.000Z")
    });

    renderSheet({ layout: refreshedLayout });

    expect(screen.getByLabelText("Дата")).toHaveValue("2026-07-27");
    expect(
      screen.getByRole("option", {
        name: "понеділок, 27 липня 2026 р."
      })
    ).toBeInTheDocument();
  });

  it("localizes domain field errors and focuses the first invalid field", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        apiError("INVALID_BOOKING_TITLE", {
          title: ["Title must contain between 1 and 100 characters"]
        })
      )
    );
    const user = userEvent.setup();
    renderSheet();

    const title = screen.getByLabelText("Назва");
    await user.type(title, "Планування");
    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    await waitFor(() =>
      expect(document.getElementById("booking-title-error")).toHaveTextContent(
        "Введіть назву від 1 до 100 символів."
      )
    );
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
  });

  it("shows an inline error and focuses the blank required title", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    const title = screen.getByLabelText("Назва");
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("booking-title-error")).toHaveTextContent(
      "Введіть назву бронювання"
    );
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderSheet({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close on Escape while creation is pending", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    let resolveCreation: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveCreation = resolve;
          })
      )
    );
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderSheet({ onClose, onCreated });

    await user.type(screen.getByLabelText("Назва"), "Планування");
    await user.click(screen.getByRole("button", { name: "Забронювати" }));
    expect(screen.getByRole("button", { name: "Бронюємо…" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    resolveCreation?.(
      apiSuccess({
        booking: {
          id: "booking-pending",
          roomId: room.id,
          title: "Планування",
          startAt: selection.startAt,
          endAt: "2026-07-27T07:00:00.000Z"
        }
      })
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it("has recurrence off by default and shows controls when enabled", async () => {
    const user = userEvent.setup();
    renderSheet();

    const checkbox = screen.getByLabelText("Повторювати щотижня");
    expect(checkbox).not.toBeChecked();
    expect(
      screen.queryByLabelText("Кількість повторень")
    ).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const countInput = screen.getByLabelText("Кількість повторень");
    expect(countInput).toHaveValue(2);
    expect(countInput).toHaveAttribute("min", "2");
    expect(countInput).toHaveAttribute("max", "52");
    expect(
      screen.getByText(
        "Введіть число від 2 до 52. Поточне бронювання є 1-м повторенням."
      )
    ).toBeVisible();
    expect(screen.getByText("2 повторення")).toBeVisible();
  });

  it("submits a recurring booking series to /api/v1/booking-series", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    const fetchMock = vi.fn().mockResolvedValue(
      apiSuccess({
        series: {
          id: "series-100",
          userId: "user-1",
          roomId: room.id,
          title: "Щотижневий статус",
          officeTimezone: "Europe/Kyiv",
          occurrenceCount: 4,
          rule: "WEEKLY"
        },
        occurrences: [
          {
            occurrenceIndex: 0,
            startAt: selection.startAt,
            endAt: "2026-07-27T07:00:00.000Z"
          }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderSheet({ onCreated });

    await user.type(screen.getByLabelText("Назва"), "Щотижневий статус");
    await user.click(screen.getByLabelText("Повторювати щотижня"));

    const countInput = screen.getByLabelText("Кількість повторень");
    await user.clear(countInput);
    await user.type(countInput, "4");

    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/booking-series", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-value"
      },
      body: JSON.stringify({
        roomId: room.id,
        title: "Щотижневий статус",
        startAt: selection.startAt,
        endAt: "2026-07-27T07:00:00.000Z",
        occurrenceCount: 4
      })
    });
  });

  it("validates occurrence count locally before submitting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSheet();

    await user.type(screen.getByLabelText("Назва"), "Щотижневий статус");
    await user.click(screen.getByLabelText("Повторювати щотижня"));

    const countInput = screen.getByLabelText("Кількість повторень");
    await user.clear(countInput);
    await user.type(countInput, "1");

    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(countInput).toHaveFocus();
    expect(
      screen.getByText("Введіть кількість повторень від 2 до 52.")
    ).toBeVisible();
  });

  it("reports conflicting occurrence number from details on conflict", async () => {
    document.cookie = "mrb_csrf=csrf-value; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: "BOOKING_CONFLICT",
            message: "Conflict",
            details: { occurrenceNumber: 3 },
            requestId: "req-1"
          }
        })
      })
    );
    const onConflict = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSheet({ onConflict });

    await user.type(screen.getByLabelText("Назва"), "Щотижневий статус");
    await user.click(screen.getByLabelText("Повторювати щотижня"));
    await user.click(screen.getByRole("button", { name: "Забронювати" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Слот для 3-го повторення щойно зайняли. Ми оновили розклад. Оберіть інший час."
    );
    expect(onConflict).toHaveBeenCalledOnce();
  });
});

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof BookingSheet>> = {}
) {
  return render(
    <BookingSheet
      bookings={response.bookings}
      initialSelection={selection}
      layout={layout}
      onClose={vi.fn()}
      onConflict={vi.fn().mockResolvedValue(undefined)}
      onCreated={vi.fn()}
      room={room}
      timezone="Europe/Kyiv"
      {...overrides}
    />
  );
}

function apiSuccess(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function apiError(code: string, fields?: Record<string, string[]>) {
  return {
    ok: false,
    json: async () => ({
      error: {
        code,
        message: "Request failed",
        ...(fields ? { fields } : {}),
        requestId: "request-123"
      }
    })
  } as Response;
}

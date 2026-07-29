import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ScheduleResponse } from "../../lib/api/contracts";
import { buildCalendarLayout } from "../../lib/calendar/schedule";
import { CalendarGrid } from "./calendar-grid";

const room = {
  id: "room-1",
  name: "Дніпро",
  floor: 4,
  capacity: 10
};

function layout(
  bookings: ScheduleResponse["bookings"] = [],
  timezone = "Europe/Kyiv",
  now = new Date("2026-07-29T07:15:00.000Z")
) {
  return buildCalendarLayout({
    response: {
      room,
      from: "2026-07-26T21:00:00.000Z",
      to: "2026-08-02T21:00:00.000Z",
      bookings
    },
    weekStart: "2026-07-27",
    timezone,
    now
  });
}

afterEach(cleanup);

describe("CalendarGrid", () => {
  it("renders all seven empty date columns, their slots, and the empty hint", () => {
    render(<CalendarGrid layout={layout()} />);

    const days = screen.getAllByTestId("calendar-day");
    expect(days).toHaveLength(7);
    expect(screen.getByText("Оберіть вільний слот")).toBeVisible();
    expect(
      days.every(
        (day) => within(day).getAllByTestId("calendar-slot").length === 20
      )
    ).toBe(true);
  });

  it("shows title and ownership or organizer in every booking fragment", () => {
    render(
      <CalendarGrid
        layout={layout([
          {
            id: "booking-own",
            title: "Планування",
            startAt: "2026-07-29T07:00:00.000Z",
            endAt: "2026-07-29T08:00:00.000Z",
            organizer: { id: "user-1", name: "Олена" },
            isOwn: true
          },
          {
            id: "booking-other",
            title: "Демо",
            startAt: "2026-07-30T08:00:00.000Z",
            endAt: "2026-07-30T09:00:00.000Z",
            organizer: { id: "user-2", name: "Тарас" },
            isOwn: false
          }
        ])}
      />
    );

    expect(screen.getByText("Планування")).toBeVisible();
    expect(screen.getByText("Моє")).toBeVisible();
    expect(screen.getByText("Демо")).toBeVisible();
    expect(screen.getByText("Тарас")).toBeVisible();
  });

  it("renders both linked fragments of a booking crossing local midnight", () => {
    render(
      <CalendarGrid
        layout={layout(
          [
            {
              id: "booking-night",
              title: "Нічна синхронізація",
              startAt: "2026-07-28T06:30:00.000Z",
              endAt: "2026-07-28T09:00:00.000Z",
              organizer: { id: "user-1", name: "Олена" },
              isOwn: true
            }
          ],
          "America/Los_Angeles"
        )}
      />
    );

    expect(screen.getAllByText("Нічна синхронізація")).toHaveLength(2);
    expect(screen.getAllByText("Моє")).toHaveLength(2);
    expect(
      screen
        .getAllByTestId("booking-fragment")
        .map((fragment) => fragment.getAttribute("data-booking-id"))
    ).toEqual(["booking-night", "booking-night"]);
  });

  it("marks the current local day and renders the current-time indicator", () => {
    render(<CalendarGrid layout={layout()} />);

    expect(screen.getByTestId("calendar-day-2026-07-29")).toHaveAttribute(
      "data-current-day",
      "true"
    );
    expect(screen.getByTestId("now-indicator")).toHaveAttribute(
      "data-slot-id",
      "2026-07-29T07:00:00.000Z"
    );
  });
});

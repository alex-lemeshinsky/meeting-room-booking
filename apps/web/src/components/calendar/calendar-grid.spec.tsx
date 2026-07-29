import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe("CalendarGrid", () => {
  it("owns one accessible horizontal scroll region for header and body", () => {
    render(<CalendarGrid layout={layout()} />);

    const scrollRegion = screen.getByTestId("calendar-scroll-region");
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(scrollRegion).toHaveAccessibleName("Прокручуваний тижневий розклад");
    expect(
      within(scrollRegion).getByTestId("calendar-day-header-2026-07-27")
    ).toBeVisible();
    expect(
      within(scrollRegion).getByTestId("calendar-day-2026-07-27")
    ).toBeVisible();
  });

  it("reveals the current day only on the first open", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    const view = render(<CalendarGrid layout={layout()} />);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
      inline: "center"
    });

    view.rerender(
      <CalendarGrid
        layout={layout([], "Europe/Kyiv", new Date("2026-07-30T07:15:00Z"))}
      />
    );
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

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

  it("marks hour dividers from each row's local minute", () => {
    render(<CalendarGrid layout={layout()} />);

    const day = within(screen.getByTestId("calendar-day-2026-07-27"));
    const slots = day.getAllByTestId("calendar-slot");
    expect(slots[0]).toHaveAttribute("data-hour-boundary", "false");
    expect(slots[1]).toHaveAttribute("data-hour-boundary", "true");
    expect(slots[2]).toHaveAttribute("data-hour-boundary", "false");
  });

  it("does not reserve compact edge-label rows in an ordinary week", () => {
    render(<CalendarGrid layout={layout()} />);

    const timeAxis = screen.getByTestId("calendar-time-axis");
    const firstDay = within(screen.getByTestId("calendar-day-2026-07-27"));
    const dayGrid = firstDay.getByTestId("calendar-day");
    expect(timeAxis.style.gridTemplateRows).toBe("repeat(20, 44px)");
    expect(dayGrid.style.gridTemplateRows).toBe("repeat(20, 44px)");
    expect(
      within(timeAxis).queryByTestId("calendar-edge-label-band")
    ).not.toBeInTheDocument();
    expect(firstDay.getAllByTestId("calendar-slot")[0]).toHaveStyle({
      gridRow: "1"
    });
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

    const currentDay = screen.getByTestId("calendar-day-2026-07-29");
    const currentHeader = screen.getByTestId("calendar-day-header-2026-07-29");

    expect(currentDay).toHaveAttribute("data-current-day", "true");
    expect(currentDay).toHaveAttribute(
      "aria-labelledby",
      "calendar-day-header-2026-07-29"
    );
    expect(currentHeader).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId("now-indicator")).toHaveAttribute(
      "data-slot-id",
      "2026-07-29T07:00:00.000Z"
    );
  });

  it("renders the explicit fold row axis and aligns post-fold slots", () => {
    const foldLayout = buildCalendarLayout({
      response: {
        room,
        from: "2026-10-26T07:00:00.000Z",
        to: "2026-11-02T08:00:00.000Z",
        bookings: []
      },
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });
    render(<CalendarGrid layout={foldLayout} />);

    const timeAxis = screen.getByTestId("calendar-time-axis");
    expect(within(timeAxis).getAllByTestId("calendar-row-label")).toHaveLength(
      50
    );
    expect(within(timeAxis).getByText("01:00 UTC-07:00")).toBeVisible();
    expect(within(timeAxis).getByText("01:00 UTC-08:00")).toBeVisible();

    const postFoldSlot = document.querySelector(
      '[data-testid="calendar-day-2026-11-01"] ' +
        '[data-slot-id="2026-11-01T10:00:00.000Z"]'
    );
    expect(postFoldSlot).toHaveStyle({ gridRow: "7" });
  });

  it("gives every booking fragment accessible date, time, and ownership context", () => {
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

    expect(
      screen.getByText("Планування").closest("article")
    ).toHaveAccessibleName("Планування. 2026-07-29, 10:00–11:00. Моє");
    expect(screen.getByText("Демо").closest("article")).toHaveAccessibleName(
      "Демо. 2026-07-30, 11:00–12:00. Організатор: Тарас"
    );
  });

  it("announces the exact second-occurrence time at a fold boundary", () => {
    const foldLayout = buildCalendarLayout({
      response: {
        room,
        from: "2026-10-26T07:00:00.000Z",
        to: "2026-11-02T08:00:00.000Z",
        bookings: [
          {
            id: "booking-fold-boundary",
            title: "Межа переходу",
            startAt: "2026-11-01T08:30:00.000Z",
            endAt: "2026-11-01T09:00:00.000Z",
            organizer: { id: "user-1", name: "Олена" },
            isOwn: true
          }
        ]
      },
      weekStart: "2026-10-26",
      timezone: "America/Los_Angeles",
      now: new Date("2026-10-26T12:00:00.000Z")
    });
    render(<CalendarGrid layout={foldLayout} />);

    expect(
      screen.getByText("Межа переходу").closest("article")
    ).toHaveAccessibleName(
      "Межа переходу. 2026-11-01, " + "01:30 UTC-07:00–01:00 UTC-08:00. Моє"
    );
  });

  it("reserves collision-free labels for back-to-back midnight fragments", () => {
    render(
      <CalendarGrid
        layout={layout(
          [
            {
              id: "booking-before-midnight",
              title: "Попередня зустріч",
              startAt: "2026-07-28T10:30:00.000Z",
              endAt: "2026-07-28T11:00:00.000Z",
              organizer: { id: "user-2", name: "Тарас" },
              isOwn: false
            },
            {
              id: "booking-chatham-midnight",
              title: "Північний перехід",
              startAt: "2026-07-28T11:00:00.000Z",
              endAt: "2026-07-28T11:30:00.000Z",
              organizer: { id: "user-1", name: "Олена" },
              isOwn: true
            }
          ],
          "Pacific/Chatham"
        )}
      />
    );

    const previousBooking = screen
      .getByText("Попередня зустріч")
      .closest("article");
    expect(previousBooking).toHaveAttribute("data-display", "standard");
    expect(previousBooking).toHaveStyle({ gridRow: "48" });
    expect(screen.getByText("Попередня зустріч")).toBeVisible();
    expect(screen.getByText("Тарас")).toBeVisible();

    const compactLabels = screen
      .getAllByText("Північний перехід")
      .map((title) => title.closest("article"));
    expect(compactLabels).toHaveLength(2);
    for (const fragment of compactLabels) {
      expect(fragment).toHaveAttribute("data-display", "compact");
      expect(within(fragment as HTMLElement).getByText("Моє")).toBeVisible();
    }
    expect(compactLabels[0]).toHaveAttribute("data-label-anchor", "end");
    expect(compactLabels[0]).toHaveStyle({ gridRow: "50" });
    expect(compactLabels[1]).toHaveAttribute("data-label-anchor", "start");
    expect(compactLabels[1]).toHaveStyle({ gridRow: "1" });

    const markers = screen.getAllByTestId("compact-booking-marker");
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveStyle({ gridRow: "49" });
    expect(markers[0]?.style.getPropertyValue("--booking-height")).toBe("22px");
    expect(markers[0]?.style.getPropertyValue("--booking-offset")).toBe("22px");
    expect(markers[1]).toHaveStyle({ gridRow: "2" });
    expect(markers[1]?.style.getPropertyValue("--booking-height")).toBe("22px");
    expect(markers[1]?.style.getPropertyValue("--booking-offset")).toBe("0px");

    const timeAxis = screen.getByTestId("calendar-time-axis");
    const day = screen.getByTestId("calendar-day-2026-07-28");
    const dayGrid = within(day).getByTestId("calendar-day");
    expect(timeAxis.style.gridTemplateRows).toBe("40px repeat(48, 44px) 40px");
    expect(dayGrid.style.gridTemplateRows).toBe("40px repeat(48, 44px) 40px");
    expect(
      within(timeAxis).getAllByTestId("calendar-row-label")[0]
    ).toHaveStyle({ gridRow: "2" });
    expect(within(dayGrid).getAllByTestId("calendar-slot")[0]).toHaveStyle({
      gridRow: "2"
    });
  });
});

"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCurrentLocalWeekStart } from "@mrb/time/calendar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RoomsResponse, ScheduleResponse } from "../../lib/api/contracts";
import { BrowserApiError } from "../../lib/api/errors";
import { formatTime } from "../../lib/calendar/booking";
import { formatOccurrenceCountLabel } from "../../lib/bookings/recurrence";
import {
  buildCalendarLayout,
  createScheduleRequest,
  fetchSchedule
} from "../../lib/calendar/schedule";
import {
  detectBrowserTimezone,
  persistBrowserTimezoneCookie
} from "../../lib/calendar/timezone";
import { RoomNotFoundState } from "../rooms/room-not-found-state";
import {
  BookingSheet,
  type BookingCreationResult
} from "../bookings/booking-sheet";
import { CalendarGrid, type BookingSlotSelection } from "./calendar-grid";
import styles from "./calendar.module.css";
import { TimezoneBanner } from "./timezone-banner";
import { WeekToolbar } from "./week-toolbar";

interface ScheduleCalendarProps {
  room: RoomsResponse["rooms"][number];
  initialWeekStart?: string | undefined;
  initialTimezone?: string | undefined;
  weekStartsOn: number;
}

interface ScheduleQueryData {
  response: ScheduleResponse;
  weekStart: string;
  timezone: string;
}

const CALENDAR_CLOCK_INTERVAL_MS = 60_000;

export function ScheduleCalendar({
  room,
  initialWeekStart,
  initialTimezone,
  weekStartsOn
}: ScheduleCalendarProps) {
  const [timezone, setTimezone] = useState<string | null>(
    initialTimezone ?? null
  );

  useEffect(() => {
    const detectedTimezone = detectBrowserTimezone();
    persistBrowserTimezoneCookie(detectedTimezone);
    setTimezone(detectedTimezone);
  }, []);

  if (timezone === null) {
    return <CalendarSkeleton />;
  }

  return (
    <ResolvedScheduleCalendar
      room={room}
      initialWeekStart={initialWeekStart}
      timezone={timezone}
      weekStartsOn={weekStartsOn}
    />
  );
}

function ResolvedScheduleCalendar({
  room,
  initialWeekStart,
  timezone,
  weekStartsOn
}: ScheduleCalendarProps & { timezone: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useCalendarNow();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlotSelection | null>(
    null
  );
  const [successMessage, setSuccessMessage] = useState<string>();
  const weekStart =
    initialWeekStart ?? getCurrentLocalWeekStart(timezone, weekStartsOn, now);
  const request = useMemo(
    () => createScheduleRequest(room.id, weekStart, timezone, weekStartsOn),
    [room.id, timezone, weekStart, weekStartsOn]
  );
  const query = useQuery<ScheduleQueryData, Error>({
    queryKey: request.queryKey,
    placeholderData: keepPreviousData,
    queryFn: async () => ({
      response: await fetchSchedule(request),
      weekStart,
      timezone
    }),
    retry: false
  });
  const isUpdating = query.isFetching && query.data !== undefined;
  const isUnauthenticated =
    query.error instanceof BrowserApiError &&
    query.error.code === "UNAUTHENTICATED";
  const isRoomNotFound =
    query.error instanceof BrowserApiError &&
    query.error.code === "ROOM_NOT_FOUND";
  const layout = useMemo(
    () =>
      query.data === undefined
        ? null
        : buildCalendarLayout({
            response: query.data.response,
            weekStart: query.data.weekStart,
            timezone: query.data.timezone,
            weekStartsOn,
            now
          }),
    [now, query.data, weekStartsOn]
  );

  useEffect(() => {
    if (isUnauthenticated) {
      router.replace("/login?reason=session");
    }
  }, [isUnauthenticated, router]);

  useEffect(() => {
    if (initialWeekStart === undefined) {
      router.replace(`${pathname}?week=${encodeURIComponent(weekStart)}`);
    }
  }, [initialWeekStart, pathname, router, weekStart]);

  const navigateToWeek = useCallback(
    (nextWeekStart: string) => {
      router.push(`${pathname}?week=${encodeURIComponent(nextWeekStart)}`);
    },
    [pathname, router]
  );

  const closeBookingSheet = useCallback(() => {
    setSelectedSlot(null);
    queueMicrotask(() => openerRef.current?.focus());
  }, []);

  const bookingCreated = useCallback(
    (result: BookingCreationResult) => {
      setSelectedSlot(null);
      if (result.kind === "series") {
        setSuccessMessage(
          `Серію бронювань створено (${formatOccurrenceCountLabel(result.response.series.occurrenceCount)}): ${room.name}.`
        );
      } else {
        setSuccessMessage(
          `Бронювання створено: ${room.name}, ` +
            `${formatTime(result.response.booking.startAt, timezone)}–` +
            `${formatTime(result.response.booking.endAt, timezone)}.`
        );
      }
      void query.refetch();
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>('[data-testid="calendar-scroll-region"]')
          ?.focus();
      });
    },
    [query, room.name, timezone]
  );

  if (query.isPending && query.data === undefined) {
    return <CalendarSkeleton />;
  }

  return (
    <section className={styles.calendarExperience}>
      <WeekToolbar
        weekStart={weekStart}
        timezone={timezone}
        weekStartsOn={weekStartsOn}
        onWeekChange={navigateToWeek}
      />
      <TimezoneBanner timezone={timezone} />

      {query.isError && isRoomNotFound ? (
        <RoomNotFoundState headingLevel={2} />
      ) : query.isError && !isUnauthenticated ? (
        <section className={styles.errorState} role="alert">
          <h2>Не вдалося завантажити розклад</h2>
          <button
            className={styles.retryAction}
            type="button"
            onClick={() => void query.refetch()}
          >
            Спробувати ще
          </button>
        </section>
      ) : layout === null || isUnauthenticated ? (
        <CalendarSkeleton />
      ) : (
        <div
          className={styles.calendarPresentation}
          data-testid="calendar-presentation"
        >
          {isUpdating ? <CalendarUpdatingStatus /> : null}
          <div
            aria-busy={isUpdating}
            className={styles.calendarStage}
            data-testid="calendar-stage"
            data-updating={isUpdating ? "true" : undefined}
          >
            <p
              aria-hidden="true"
              className={styles.scrollCue}
              data-testid="calendar-scroll-cue"
            >
              Прокрутіть, щоб побачити інші дні
              <span>→</span>
            </p>
            <CalendarGrid
              layout={layout}
              onSelectSlot={(selection, trigger) => {
                openerRef.current = trigger;
                setSuccessMessage(undefined);
                setSelectedSlot(selection);
              }}
            />
          </div>
        </div>
      )}

      {successMessage ? (
        <div className={styles.successToast} role="status">
          {successMessage}
        </div>
      ) : null}

      {selectedSlot !== null && query.data !== undefined && layout !== null ? (
        <BookingSheet
          bookings={query.data.response.bookings}
          initialSelection={selectedSlot}
          layout={layout}
          onClose={closeBookingSheet}
          onConflict={async () => {
            await query.refetch();
          }}
          onCreated={bookingCreated}
          room={room}
          timezone={timezone}
        />
      ) : null}
    </section>
  );
}

function CalendarUpdatingStatus() {
  return (
    <div aria-live="polite" className={styles.updatingStatus} role="status">
      <span aria-hidden="true" className={styles.updatingIcon}>
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
          <path d="M15.5 13.5a3 3 0 1 0 .6 3.4M16 12.5v3h-3" />
        </svg>
      </span>
      <span className={styles.updatingCopy}>
        <strong>Оновлюємо розклад</strong>
        <span>
          Попередній тиждень залишається на екрані, поки завантажуються нові
          дані.
        </span>
      </span>
      <span aria-hidden="true" className={styles.updatingProgress} />
    </div>
  );
}

function useCalendarNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, CALENDAR_CLOCK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function CalendarSkeleton() {
  return (
    <section
      className={styles.calendarSkeleton}
      data-calendar-skeleton=""
      role="status"
      aria-label="Завантажуємо розклад"
    >
      <span className={styles.skeletonLabel}>Завантажуємо розклад</span>
      <div className={styles.skeletonToolbar} />
      <div className={styles.skeletonBanner} />
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </section>
  );
}

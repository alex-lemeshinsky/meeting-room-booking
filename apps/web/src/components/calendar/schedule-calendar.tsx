"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RoomsResponse, ScheduleResponse } from "../../lib/api/contracts";
import { BrowserApiError } from "../../lib/api/errors";
import {
  buildCalendarLayout,
  createScheduleRequest,
  fetchSchedule
} from "../../lib/calendar/schedule";
import {
  detectBrowserTimezone,
  persistBrowserTimezoneCookie
} from "../../lib/calendar/timezone";
import { CalendarGrid } from "./calendar-grid";
import styles from "./calendar.module.css";
import { TimezoneBanner } from "./timezone-banner";
import { WeekToolbar } from "./week-toolbar";

interface ScheduleCalendarProps {
  room: RoomsResponse["rooms"][number];
  initialWeekStart: string;
}

interface ScheduleQueryData {
  response: ScheduleResponse;
  weekStart: string;
  timezone: string;
}

const CALENDAR_CLOCK_INTERVAL_MS = 60_000;

export function ScheduleCalendar({
  room,
  initialWeekStart
}: ScheduleCalendarProps) {
  const [timezone, setTimezone] = useState<string | null>(null);

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
    />
  );
}

function ResolvedScheduleCalendar({
  room,
  initialWeekStart,
  timezone
}: ScheduleCalendarProps & { timezone: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useCalendarNow();
  const weekStart = initialWeekStart;
  const request = useMemo(
    () => createScheduleRequest(room.id, weekStart, timezone),
    [room.id, timezone, weekStart]
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
  const isUnauthenticated =
    query.error instanceof BrowserApiError &&
    query.error.code === "UNAUTHENTICATED";
  const layout = useMemo(
    () =>
      query.data === undefined
        ? null
        : buildCalendarLayout({
            response: query.data.response,
            weekStart: query.data.weekStart,
            timezone: query.data.timezone,
            now
          }),
    [now, query.data]
  );

  useEffect(() => {
    if (isUnauthenticated) {
      router.replace("/login?reason=session");
    }
  }, [isUnauthenticated, router]);

  const navigateToWeek = useCallback(
    (nextWeekStart: string) => {
      router.push(`${pathname}?week=${encodeURIComponent(nextWeekStart)}`);
    },
    [pathname, router]
  );

  if (query.isPending && query.data === undefined) {
    return <CalendarSkeleton />;
  }

  return (
    <section className={styles.calendarExperience}>
      <WeekToolbar
        weekStart={weekStart}
        timezone={timezone}
        onWeekChange={navigateToWeek}
      />
      <TimezoneBanner timezone={timezone} />

      {query.isFetching && query.data !== undefined ? (
        <p className={styles.updatingStatus} role="status">
          Оновлюємо розклад
        </p>
      ) : null}

      {query.isError && !isUnauthenticated ? (
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
        <CalendarGrid layout={layout} />
      )}
    </section>
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

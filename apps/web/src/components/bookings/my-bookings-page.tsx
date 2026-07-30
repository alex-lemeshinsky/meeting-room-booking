"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MyBookingsResponse } from "../../lib/api/contracts";
import { fetchMyBookings } from "../../lib/api/bookings";
import {
  bookingCalendarHref,
  formatMyBookingInterval,
  myBookingStateLabel
} from "../../lib/bookings/my-bookings";
import {
  detectBrowserTimezone,
  persistBrowserTimezoneCookie
} from "../../lib/calendar/timezone";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import styles from "./my-bookings.module.css";

type MyBooking = MyBookingsResponse["bookings"][number];
type Section = "upcoming" | "history";

interface CancellationSelection {
  booking: MyBooking;
  trigger: HTMLButtonElement;
}

interface MyBookingsPageProps {
  initialUpcoming: MyBookingsResponse;
  initialTimezone?: string;
}

export function MyBookingsPage({
  initialUpcoming,
  initialTimezone
}: MyBookingsPageProps) {
  const queryClient = useQueryClient();
  const upcomingPanelRef = useRef<HTMLElement>(null);
  const [section, setSection] = useState<Section>("upcoming");
  const [timezone, setTimezone] = useState<string | null>(
    initialTimezone ?? null
  );
  const [cancellation, setCancellation] = useState<CancellationSelection>();
  const [successMessage, setSuccessMessage] = useState<string>();

  useEffect(() => {
    const detectedTimezone = detectBrowserTimezone();
    persistBrowserTimezoneCookie(detectedTimezone);
    setTimezone(detectedTimezone);
  }, []);

  const upcoming = useQuery({
    queryKey: ["my-bookings", "upcoming"],
    queryFn: () => fetchMyBookings("upcoming"),
    initialData: initialUpcoming,
    retry: false,
    staleTime: 60_000
  });
  const history = useInfiniteQuery({
    queryKey: ["my-bookings", "history"],
    queryFn: ({ pageParam }) => fetchMyBookings("history", pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: section === "history",
    retry: false
  });
  const historyBookings = useMemo(
    () => history.data?.pages.flatMap((page) => page.bookings) ?? [],
    [history.data]
  );

  if (timezone === null) {
    return <MyBookingsSkeleton />;
  }

  async function cancelled(booking: MyBooking) {
    setSuccessMessage(`Бронювання «${booking.title}» скасовано.`);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["schedule"] })
    ]);
    setCancellation(undefined);
    queueMicrotask(() => upcomingPanelRef.current?.focus());
  }

  function closeCancellationDialog() {
    const trigger = cancellation?.trigger;
    setCancellation(undefined);
    queueMicrotask(() => trigger?.focus());
  }

  const upcomingCount = upcoming.data.bookings.length;
  const upcomingTabLabel = `Майбутні (${upcomingCount})`;

  return (
    <section className={styles.experience} aria-labelledby="my-bookings-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Ваші зустрічі</p>
        <h1 id="my-bookings-title">Мої бронювання</h1>
        <p>Переглядайте майбутні зустрічі та збережену історію.</p>
      </div>

      <div
        aria-label="Розділи бронювань"
        className={styles.tabs}
        role="tablist"
      >
        <button
          aria-controls="upcoming-bookings-panel"
          aria-selected={section === "upcoming"}
          id="upcoming-bookings-tab"
          onClick={() => setSection("upcoming")}
          role="tab"
          type="button"
        >
          {upcomingTabLabel}
        </button>
        <button
          aria-controls="history-bookings-panel"
          aria-selected={section === "history"}
          id="history-bookings-tab"
          onClick={() => setSection("history")}
          role="tab"
          type="button"
        >
          Історія
        </button>
      </div>

      {section === "upcoming" ? (
        <section
          aria-labelledby="upcoming-bookings-tab"
          className={styles.panel}
          id="upcoming-bookings-panel"
          ref={upcomingPanelRef}
          role="tabpanel"
          tabIndex={-1}
        >
          {upcoming.isError ? (
            <ErrorState
              message="Не вдалося оновити майбутні бронювання."
              onRetry={() => void upcoming.refetch()}
            />
          ) : upcoming.data.bookings.length === 0 ? (
            <EmptyUpcoming />
          ) : (
            <BookingList
              bookings={upcoming.data.bookings}
              timezone={timezone}
              onCancel={(booking, trigger) =>
                setCancellation({ booking, trigger })
              }
            />
          )}
        </section>
      ) : (
        <section
          aria-labelledby="history-bookings-tab"
          className={styles.panel}
          id="history-bookings-panel"
          role="tabpanel"
        >
          {history.isPending ? (
            <MyBookingsSkeleton compact />
          ) : history.isError ? (
            <ErrorState
              message="Не вдалося завантажити історію."
              onRetry={() => void history.refetch()}
            />
          ) : historyBookings.length === 0 ? (
            <EmptyHistory />
          ) : (
            <>
              <BookingList bookings={historyBookings} timezone={timezone} />
              {history.hasNextPage ? (
                <button
                  className={styles.loadMore}
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                  type="button"
                >
                  {history.isFetchingNextPage
                    ? "Завантажуємо…"
                    : "Завантажити ще"}
                </button>
              ) : null}
            </>
          )}
        </section>
      )}

      {successMessage ? (
        <div className={styles.successToast} role="status">
          {successMessage}
        </div>
      ) : null}

      {cancellation ? (
        <CancelBookingDialog
          booking={cancellation.booking}
          onCancelled={() => cancelled(cancellation.booking)}
          onClose={closeCancellationDialog}
          timezone={timezone}
        />
      ) : null}
    </section>
  );
}

function BookingList({
  bookings,
  timezone,
  onCancel
}: {
  bookings: MyBooking[];
  timezone: string;
  onCancel?: (booking: MyBooking, trigger: HTMLButtonElement) => void;
}) {
  return (
    <ul className={styles.list}>
      {bookings.map((booking) => (
        <li className={styles.row} key={booking.id}>
          <Link
            aria-label={`Відкрити бронювання «${booking.title}» в календарі`}
            className={styles.rowLink}
            href={bookingCalendarHref(booking, timezone)}
          >
            <span className={styles.rowMain}>
              <strong>{booking.title}</strong>
              <span>{booking.room.name}</span>
            </span>
            <span className={styles.interval}>
              {formatMyBookingInterval(booking, timezone)}
            </span>
            <span
              className={styles.state}
              data-state={booking.state.toLowerCase()}
            >
              {myBookingStateLabel(booking.state)}
            </span>
          </Link>
          {onCancel ? (
            <button
              aria-label={`Скасувати бронювання «${booking.title}»`}
              className={styles.cancelAction}
              onClick={(event) => onCancel(booking, event.currentTarget)}
              type="button"
            >
              Скасувати
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function EmptyUpcoming() {
  return (
    <section className={styles.emptyState}>
      <h2>Немає майбутніх бронювань</h2>
      <p>Оберіть кімнату й знайдіть вільний час у календарі.</p>
      <Link className={styles.primaryLink} href="/rooms">
        Перейти до кімнат
      </Link>
    </section>
  );
}

function EmptyHistory() {
  return (
    <section className={styles.emptyState}>
      <h2>Історія порожня</h2>
      <p>Завершені та скасовані бронювання з’являться тут.</p>
    </section>
  );
}

function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry(): void;
}) {
  return (
    <section className={styles.errorState} role="alert">
      <h2>{message}</h2>
      <button className={styles.retryAction} onClick={onRetry} type="button">
        Спробувати ще
      </button>
    </section>
  );
}

function MyBookingsSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Завантажуємо бронювання"
      className={styles.skeleton}
      data-compact={compact || undefined}
      role="status"
    >
      <span>Завантажуємо бронювання</span>
      {Array.from({ length: compact ? 3 : 4 }, (_, index) => (
        <i key={index} />
      ))}
    </section>
  );
}

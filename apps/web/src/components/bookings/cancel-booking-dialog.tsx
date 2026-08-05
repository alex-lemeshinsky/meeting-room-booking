"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { MyBookingsResponse } from "../../lib/api/contracts";
import { cancelBooking, cancelBookingSeries } from "../../lib/api/bookings";
import { BrowserApiError } from "../../lib/api/errors";
import { formatMyBookingInterval } from "../../lib/bookings/my-bookings";
import { containTabFocus, lockDocumentScroll } from "../../lib/ui/overlay";
import styles from "./my-bookings.module.css";

type MyBooking = MyBookingsResponse["bookings"][number];

export type CancellationScope = "occurrence" | "series";

interface CancelBookingDialogProps {
  booking: MyBooking;
  timezone: string;
  onClose(): void;
  onCancelled(scope: CancellationScope): Promise<void>;
}

export function CancelBookingDialog({
  booking,
  timezone,
  onClose,
  onCancelled
}: CancelBookingDialogProps) {
  const safeActionRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [pendingChoice, setPendingChoice] = useState<
    "occurrence" | "series" | undefined
  >();
  const [requestError, setRequestError] = useState<string>();
  const isPending = pendingChoice !== undefined;
  const isSeries = booking.seriesId != null;

  useEffect(() => {
    safeActionRef.current?.focus();
  }, []);

  useEffect(() => lockDocumentScroll(document), []);

  useEffect(() => {
    if (requestError !== undefined) errorRef.current?.focus();
  }, [requestError]);

  async function handleCancelSingle() {
    if (isPending) return;

    setPendingChoice("occurrence");
    setRequestError(undefined);
    try {
      await cancelBooking(booking.id);
      await onCancelled("occurrence");
    } catch (error) {
      setRequestError(localizedCancellationError(error));
    } finally {
      setPendingChoice(undefined);
    }
  }

  async function handleCancelSeries() {
    if (isPending || !booking.seriesId) return;

    setPendingChoice("series");
    setRequestError(undefined);
    try {
      await cancelBookingSeries(booking.seriesId);
      await onCancelled("series");
    } catch (error) {
      setRequestError(localizedCancellationError(error));
    } finally {
      setPendingChoice(undefined);
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) onClose();
      return;
    }
    containTabFocus(event);
  }

  return (
    <div className={styles.dialogBackdrop}>
      <section
        aria-labelledby="cancel-booking-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
      >
        <div>
          <p className={styles.dialogEyebrow}>Підтвердження</p>
          <h2 id="cancel-booking-title">Скасувати бронювання</h2>
        </div>
        <p>
          «{booking.title}», {booking.room.name},{" "}
          {formatMyBookingInterval(booking, timezone)}
        </p>
        <p className={styles.dialogWarning}>
          {isSeries
            ? "Оберіть, чи скасувати лише цієї зустріч, чи всю повторювану серію."
            : "Бронювання залишиться в історії, але кімната знову стане доступною."}
        </p>

        {requestError ? (
          <div
            className={styles.dialogError}
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            {requestError}
          </div>
        ) : null}

        <footer className={styles.dialogActions}>
          <button
            className={styles.secondaryAction}
            disabled={isPending}
            onClick={onClose}
            ref={safeActionRef}
            type="button"
          >
            Залишити бронювання
          </button>
          {isSeries ? (
            <>
              <button
                className={styles.dangerAction}
                disabled={isPending}
                onClick={() => void handleCancelSingle()}
                type="button"
              >
                {pendingChoice === "occurrence"
                  ? "Скасовуємо…"
                  : "Лише цю подію"}
              </button>
              <button
                className={styles.dangerAction}
                disabled={isPending}
                onClick={() => void handleCancelSeries()}
                type="button"
              >
                {pendingChoice === "series" ? "Скасовуємо…" : "Усю серію"}
              </button>
            </>
          ) : (
            <button
              className={styles.dangerAction}
              disabled={isPending}
              onClick={() => void handleCancelSingle()}
              type="button"
            >
              {pendingChoice === "occurrence"
                ? "Скасовуємо…"
                : "Скасувати бронювання"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function localizedCancellationError(error: unknown): string {
  if (error instanceof BrowserApiError) {
    return (
      {
        BOOKING_ALREADY_ENDED:
          "Це бронювання вже завершилося і його не можна скасувати.",
        BOOKING_ALREADY_CANCELLED: "Це бронювання вже скасовано.",
        BOOKING_FORBIDDEN: "Ви можете скасовувати лише власні бронювання.",
        BOOKING_NOT_FOUND: "Це бронювання більше не існує.",
        BOOKING_SERIES_FORBIDDEN:
          "Ви можете скасовувати лише власні серії бронювань.",
        BOOKING_SERIES_NOT_FOUND: "Ця серія бронювань більше не існує.",
        SERIES_NOT_CANCELLABLE:
          "У цієї серії немає активних майбутніх повторень для скасування."
      }[error.code] ?? "Не вдалося скасувати бронювання. Спробуйте ще раз."
    );
  }

  return "Не вдалося скасувати бронювання. Спробуйте ще раз.";
}

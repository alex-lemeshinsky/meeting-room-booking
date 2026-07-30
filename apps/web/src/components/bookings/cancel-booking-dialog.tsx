"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { MyBookingsResponse } from "../../lib/api/contracts";
import { cancelBooking } from "../../lib/api/bookings";
import { BrowserApiError } from "../../lib/api/errors";
import { formatMyBookingInterval } from "../../lib/bookings/my-bookings";
import styles from "./my-bookings.module.css";

type MyBooking = MyBookingsResponse["bookings"][number];

interface CancelBookingDialogProps {
  booking: MyBooking;
  timezone: string;
  onClose(): void;
  onCancelled(): Promise<void>;
}

export function CancelBookingDialog({
  booking,
  timezone,
  onClose,
  onCancelled
}: CancelBookingDialogProps) {
  const safeActionRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [requestError, setRequestError] = useState<string>();

  useEffect(() => {
    safeActionRef.current?.focus();
  }, []);

  useEffect(() => {
    if (requestError !== undefined) errorRef.current?.focus();
  }, [requestError]);

  async function confirmCancellation() {
    if (isPending) return;

    setIsPending(true);
    setRequestError(undefined);
    try {
      await cancelBooking(booking.id);
      await onCancelled();
    } catch (error) {
      setRequestError(localizedCancellationError(error));
    } finally {
      setIsPending(false);
    }
  }

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)")
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      !focusable.includes(activeElement)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.dialogBackdrop}>
      <section
        aria-labelledby="cancel-booking-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={keepFocusInside}
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
          Бронювання залишиться в історії, але кімната знову стане доступною.
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
          <button
            className={styles.dangerAction}
            disabled={isPending}
            onClick={() => void confirmCancellation()}
            type="button"
          >
            {isPending ? "Скасовуємо…" : "Скасувати бронювання"}
          </button>
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
        BOOKING_NOT_FOUND: "Це бронювання більше не існує."
      }[error.code] ?? "Не вдалося скасувати бронювання. Спробуйте ще раз."
    );
  }

  return "Не вдалося скасувати бронювання. Спробуйте ще раз.";
}

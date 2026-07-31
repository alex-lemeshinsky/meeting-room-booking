"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  CreateBookingResponse,
  RoomsResponse,
  ScheduleResponse
} from "../../lib/api/contracts";
import { createBooking } from "../../lib/api/bookings";
import { BrowserApiError } from "../../lib/api/errors";
import {
  buildBookingEndOptions,
  formatBookingInterval,
  formatTime,
  type BookingTimeOption
} from "../../lib/calendar/booking";
import type { CalendarLayout } from "../../lib/calendar/schedule";
import { containTabFocus, lockDocumentScroll } from "../../lib/ui/overlay";
import type { BookingSlotSelection } from "../calendar/calendar-grid";
import styles from "./booking-sheet.module.css";

interface BookingSheetProps {
  room: RoomsResponse["rooms"][number];
  layout: CalendarLayout;
  bookings: ScheduleResponse["bookings"];
  timezone: string;
  initialSelection: BookingSlotSelection;
  onClose(): void;
  onConflict(): Promise<void>;
  onCreated(response: CreateBookingResponse): void;
}

export function BookingSheet({
  room,
  layout,
  bookings,
  timezone,
  initialSelection,
  onClose,
  onConflict,
  onCreated
}: BookingSheetProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLSelectElement>(null);
  const endRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const shouldFocusRequestError = useRef(false);
  const [title, setTitle] = useState("");
  const [localDate, setLocalDate] = useState(initialSelection.localDate);
  const [startAt, setStartAt] = useState(initialSelection.startAt);
  const initialEnd = useMemo(
    () =>
      buildBookingEndOptions(initialSelection.startAt, bookings, timezone)[0]
        ?.value ?? "",
    [bookings, initialSelection.startAt, timezone]
  );
  const [endAt, setEndAt] = useState(initialEnd);
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [requestError, setRequestError] = useState<string>();

  const availableDays = useMemo(() => {
    const bookableDays = layout.days.filter((day) =>
      day.slots.some((slot) => slot.bookingStartAt !== undefined)
    );
    if (bookableDays.some((day) => day.localDate === localDate)) {
      return bookableDays;
    }

    const selectedDay = layout.days.find((day) => day.localDate === localDate);
    return selectedDay === undefined
      ? bookableDays
      : [selectedDay, ...bookableDays];
  }, [layout.days, localDate]);
  const startOptions = useMemo(() => {
    const day = layout.days.find(
      (candidate) => candidate.localDate === localDate
    );
    const options = (day?.slots ?? []).flatMap((slot) =>
      slot.bookingStartAt === undefined || slot.bookingStartLabel === undefined
        ? []
        : [{ value: slot.bookingStartAt, label: slot.bookingStartLabel }]
    );

    return preserveSelectedOption(
      options,
      startAt,
      formatTime(startAt, timezone)
    );
  }, [layout.days, localDate, startAt, timezone]);
  const endOptions = useMemo(
    () =>
      preserveSelectedOption(
        buildBookingEndOptions(startAt, bookings, timezone),
        endAt,
        endAt === "" ? "" : formatTime(endAt, timezone)
      ),
    [bookings, endAt, startAt, timezone]
  );

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => lockDocumentScroll(document), []);

  useEffect(() => {
    if (requestError !== undefined && shouldFocusRequestError.current) {
      shouldFocusRequestError.current = false;
      errorRef.current?.focus();
    }
  }, [requestError]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isPending, onClose]);

  function changeDate(event: ChangeEvent<HTMLSelectElement>) {
    const nextDate = event.target.value;
    const firstStart = layout.days
      .find((day) => day.localDate === nextDate)
      ?.slots.find((slot) => slot.bookingStartAt !== undefined)?.bookingStartAt;
    if (firstStart === undefined) return;

    setLocalDate(nextDate);
    setStartAt(firstStart);
    setEndAt(
      buildBookingEndOptions(firstStart, bookings, timezone)[0]?.value ?? ""
    );
    clearErrors();
  }

  function changeStart(event: ChangeEvent<HTMLSelectElement>) {
    const nextStart = event.target.value;
    setStartAt(nextStart);
    setEndAt(
      buildBookingEndOptions(nextStart, bookings, timezone)[0]?.value ?? ""
    );
    clearErrors();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearErrors();

    if (title.trim().length === 0) {
      setFieldErrors({ title: ["Введіть назву бронювання"] });
      titleRef.current?.focus();
      return;
    }

    setIsPending(true);
    try {
      const created = await createBooking({
        roomId: room.id,
        title,
        startAt,
        endAt
      });
      onCreated(created);
    } catch (error) {
      if (error instanceof BrowserApiError) {
        if (error.code === "BOOKING_CONFLICT") {
          shouldFocusRequestError.current = true;
          setRequestError(
            "Цей слот щойно зайняли. Ми оновили розклад. Оберіть інший час."
          );
          await onConflict();
        } else {
          const localizedFields = localizedFieldErrors(
            error.code,
            error.fields
          );
          setFieldErrors(localizedFields);
          setRequestError(localizedError(error.code));
          queueMicrotask(() =>
            focusFirstInvalidField(
              localizedFields,
              titleRef.current,
              startRef.current,
              endRef.current
            )
          );
        }
      } else {
        shouldFocusRequestError.current = true;
        setRequestError("Не вдалося створити бронювання. Спробуйте ще раз.");
      }
    } finally {
      setIsPending(false);
    }
  }

  function clearErrors() {
    setFieldErrors({});
    setRequestError(undefined);
  }

  return (
    <div className={styles.backdrop}>
      <aside
        aria-describedby="booking-sheet-description"
        aria-labelledby="booking-sheet-title"
        aria-modal="true"
        className={styles.sheet}
        onKeyDown={containTabFocus}
        role="dialog"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Нове бронювання</p>
            <h2 id="booking-sheet-title">Нове бронювання</h2>
            <p className={styles.description} id="booking-sheet-description">
              Час показано у вашому часовому поясі. Робочі години перевіряються
              за часом офісу.
            </p>
          </div>
          <button
            aria-label="Закрити форму бронювання"
            className={styles.closeAction}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form className={styles.form} noValidate onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="booking-room">Кімната</label>
            <input disabled id="booking-room" value={room.name} />
          </div>

          <div className={styles.field}>
            <label htmlFor="booking-date">Дата</label>
            <select id="booking-date" onChange={changeDate} value={localDate}>
              {availableDays.map((day) => (
                <option key={day.localDate} value={day.localDate}>
                  {day.fullDateLabel}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.timeFields}>
            <div className={styles.field}>
              <label htmlFor="booking-start">Початок</label>
              <select
                aria-describedby={
                  fieldErrors.startAt ? "booking-start-error" : undefined
                }
                aria-invalid={fieldErrors.startAt ? true : undefined}
                id="booking-start"
                onChange={changeStart}
                ref={startRef}
                value={startAt}
              >
                {startOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError
                id="booking-start-error"
                messages={fieldErrors.startAt}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="booking-end">Завершення</label>
              <select
                aria-describedby={
                  fieldErrors.endAt ? "booking-end-error" : undefined
                }
                aria-invalid={fieldErrors.endAt ? true : undefined}
                id="booking-end"
                onChange={(event) => {
                  setEndAt(event.target.value);
                  clearErrors();
                }}
                ref={endRef}
                value={endAt}
              >
                {endOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError id="booking-end-error" messages={fieldErrors.endAt} />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="booking-title">Назва</label>
            <input
              aria-describedby={
                fieldErrors.title ? "booking-title-error" : undefined
              }
              aria-invalid={fieldErrors.title ? true : undefined}
              id="booking-title"
              maxLength={100}
              onChange={(event) => {
                setTitle(event.target.value);
                clearErrors();
              }}
              ref={titleRef}
              required
              value={title}
            />
            <FieldError id="booking-title-error" messages={fieldErrors.title} />
          </div>

          <div className={styles.summary}>
            <p>
              <strong>Ваш час:</strong>{" "}
              {formatBookingInterval(startAt, endAt, timezone)} ({timezone})
            </p>
            <p>
              <strong>Час офісу:</strong>{" "}
              {formatBookingInterval(startAt, endAt, "Europe/Kyiv")}{" "}
              (Europe/Kyiv)
            </p>
          </div>

          {requestError ? (
            <div
              className={styles.requestError}
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {requestError}
            </div>
          ) : null}

          <footer className={styles.actions}>
            <button
              className={styles.secondaryAction}
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Закрити
            </button>
            <button
              className={styles.primaryAction}
              disabled={isPending || endAt === ""}
              type="submit"
            >
              {isPending ? "Бронюємо…" : "Забронювати"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

function preserveSelectedOption(
  options: BookingTimeOption[],
  value: string,
  label: string
): BookingTimeOption[] {
  if (value === "" || options.some((option) => option.value === value)) {
    return options;
  }
  return [{ value, label }, ...options];
}

function FieldError({
  id,
  messages
}: {
  id: string;
  messages: string[] | undefined;
}) {
  return messages === undefined ? null : (
    <p className={styles.fieldError} id={id}>
      {messages.join(" ")}
    </p>
  );
}

function localizedError(code: string): string {
  return (
    {
      BOOKING_NOT_IN_FUTURE: "Оберіть час початку в майбутньому.",
      BOOKING_OFF_GRID: "Оберіть час на межі 30-хвилинного слота.",
      BOOKING_OUTSIDE_OFFICE_HOURS:
        "Бронювання має бути в межах робочих годин офісу.",
      INVALID_BOOKING_DURATION: "Оберіть тривалість від 30 хвилин до 4 годин.",
      INVALID_BOOKING_TITLE: "Введіть назву від 1 до 100 символів.",
      ROOM_NOT_FOUND: "Ця кімната більше не доступна."
    }[code] ?? "Не вдалося створити бронювання. Спробуйте ще раз."
  );
}

function localizedFieldErrors(
  code: string,
  serverFields: Record<string, string[]>
): Record<string, string[]> {
  const known = {
    BOOKING_NOT_IN_FUTURE: {
      startAt: ["Оберіть час початку в майбутньому."]
    },
    BOOKING_OFF_GRID: {
      startAt: ["Оберіть час на межі 30-хвилинного слота."],
      endAt: ["Оберіть час на межі 30-хвилинного слота."]
    },
    BOOKING_OUTSIDE_OFFICE_HOURS: {
      startAt: ["Оберіть час у межах робочих годин офісу."],
      endAt: ["Оберіть час у межах робочих годин офісу."]
    },
    INVALID_BOOKING_DURATION: {
      endAt: ["Оберіть тривалість від 30 хвилин до 4 годин."]
    },
    INVALID_BOOKING_TITLE: {
      title: ["Введіть назву від 1 до 100 символів."]
    }
  }[code];
  if (known !== undefined) return known;

  return Object.fromEntries(
    Object.keys(serverFields).map((field) => [
      field,
      ["Перевірте значення цього поля."]
    ])
  );
}

function focusFirstInvalidField(
  fields: Record<string, string[]>,
  title: HTMLInputElement | null,
  start: HTMLSelectElement | null,
  end: HTMLSelectElement | null
) {
  if (fields.title) title?.focus();
  else if (fields.startAt) start?.focus();
  else if (fields.endAt) end?.focus();
}

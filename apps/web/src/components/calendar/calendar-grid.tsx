"use client";

import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";
import type { CalendarLayout } from "../../lib/calendar/schedule";
import styles from "./calendar.module.css";

const SLOT_HEIGHT_PX = 44;
const EDGE_LABEL_HEIGHT_PX = 40;

interface CalendarGridProps {
  layout: CalendarLayout;
  onSelectSlot?: (
    selection: BookingSlotSelection,
    trigger: HTMLButtonElement
  ) => void;
}

export interface BookingSlotSelection {
  slotId: string;
  startAt: string;
  startLabel: string;
  localDate: string;
  fullDateLabel: string;
}

function endsAtHour(minuteOfDay: number): boolean {
  return (minuteOfDay + 30) % 60 === 0;
}

function elapsedState(elapsedPercent: number): "none" | "partial" | "full" {
  if (elapsedPercent <= 0) {
    return "none";
  }

  return elapsedPercent >= 100 ? "full" : "partial";
}

export function CalendarGrid({ layout, onSelectSlot }: CalendarGridProps) {
  const currentDayHeaderRef = useRef<HTMLTimeElement>(null);
  const didRevealCurrentDay = useRef(false);
  const firstBookableSlotId = layout.days
    .flatMap((day) => day.slots)
    .find((slot) => slot.bookingStartAt !== undefined)?.id;
  const [activeSlotId, setActiveSlotId] = useState(firstBookableSlotId);
  const hasCompactBookings = layout.bookings.some(
    (booking) => booking.heightInRows < 1
  );
  const edgeRowOffset = hasCompactBookings ? 1 : 0;
  const gridTemplateRows = hasCompactBookings
    ? `${EDGE_LABEL_HEIGHT_PX}px ` +
      `repeat(${layout.rows.length}, ${SLOT_HEIGHT_PX}px) ` +
      `${EDGE_LABEL_HEIGHT_PX}px`
    : `repeat(${layout.rows.length}, ${SLOT_HEIGHT_PX}px)`;

  useEffect(() => {
    if (didRevealCurrentDay.current || currentDayHeaderRef.current === null) {
      return;
    }

    currentDayHeaderRef.current.scrollIntoView?.({
      behavior: "auto",
      block: "nearest",
      inline: "center"
    });
    didRevealCurrentDay.current = true;
  }, [layout.days]);

  useEffect(() => {
    const hasActiveSlot = layout.days.some((day) =>
      day.slots.some(
        (slot) => slot.id === activeSlotId && slot.bookingStartAt !== undefined
      )
    );
    if (!hasActiveSlot) {
      setActiveSlotId(firstBookableSlotId);
    }
  }, [activeSlotId, firstBookableSlotId, layout.days]);

  function moveSlotFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    dayIndex: number,
    rowIndex: number
  ) {
    let dayDelta = 0;
    let rowDelta = 0;
    if (event.key === "ArrowDown") rowDelta = 1;
    else if (event.key === "ArrowLeft") dayDelta = -1;
    else if (event.key === "ArrowRight") dayDelta = 1;
    else if (event.key === "ArrowUp") rowDelta = -1;
    else return;

    event.preventDefault();
    let nextDay = dayIndex + dayDelta;
    let nextRow = rowIndex + rowDelta;

    while (
      nextDay >= 0 &&
      nextDay < layout.days.length &&
      nextRow >= 0 &&
      nextRow < layout.rows.length
    ) {
      const target = document.querySelector<HTMLButtonElement>(
        `[data-booking-slot="true"][data-day-index="${nextDay}"]` +
          `[data-row-index="${nextRow}"]`
      );
      if (target !== null) {
        setActiveSlotId(target.dataset.slotId);
        target.focus();
        return;
      }

      nextDay += dayDelta;
      nextRow += rowDelta;
      if (dayDelta !== 0) return;
    }
  }

  return (
    <section
      aria-label="Прокручуваний тижневий розклад"
      aria-describedby="calendar-elapsed-description"
      className={styles.gridShell}
      data-testid="calendar-scroll-region"
      tabIndex={0}
    >
      <p className={styles.visuallyHidden} id="calendar-elapsed-description">
        Затінення показує минулу частину поточного дня.
      </p>
      <div className={styles.gridHeader}>
        <span className={styles.timeHeader} aria-hidden="true">
          Час
        </span>
        {layout.days.map((day) => (
          <time
            className={
              day.isToday
                ? `${styles.dayHeader} ${styles.currentDayHeader}`
                : styles.dayHeader
            }
            aria-current={day.isToday ? "date" : undefined}
            data-testid={`calendar-day-header-${day.localDate}`}
            dateTime={day.localDate}
            id={`calendar-day-header-${day.localDate}`}
            key={day.localDate}
            ref={day.isToday ? currentDayHeaderRef : undefined}
            aria-label={day.fullDateLabel}
          >
            <span>{day.label}</span>
          </time>
        ))}
      </div>

      <div className={styles.gridBody}>
        <div
          className={styles.timeAxis}
          data-testid="calendar-time-axis"
          aria-hidden="true"
          style={{ gridTemplateRows }}
        >
          {hasCompactBookings ? (
            <span
              className={styles.edgeLabelBand}
              data-edge="start"
              data-testid="calendar-edge-label-band"
              style={{ gridRow: 1 }}
            />
          ) : null}
          {layout.rows.map((row, rowIndex) => (
            <span
              className={
                endsAtHour(row.minuteOfDay) ? styles.hourBoundary : undefined
              }
              data-hour-boundary={
                endsAtHour(row.minuteOfDay) ? "true" : "false"
              }
              data-testid="calendar-row-label"
              key={row.id}
              style={{ gridRow: rowIndex + 1 + edgeRowOffset }}
            >
              {row.label}
              {row.offsetLabel === undefined ? null : ` ${row.offsetLabel}`}
            </span>
          ))}
          {hasCompactBookings ? (
            <span
              className={styles.edgeLabelBand}
              data-edge="end"
              data-testid="calendar-edge-label-band"
              style={{ gridRow: layout.rows.length + 2 }}
            />
          ) : null}
        </div>

        <div className={styles.dayColumns}>
          {layout.days.map((day, dayIndex) => {
            const bookings = layout.bookings.filter(
              (booking) => booking.localDate === day.localDate
            );
            const now =
              layout.now?.localDate === day.localDate ? layout.now : undefined;
            const nowSlot =
              now === undefined
                ? undefined
                : day.slots.find((slot) => slot.id === now.slotId);
            const slotByRow = new Map(
              day.slots.map((slot) => [slot.rowIndex, slot])
            );

            return (
              <section
                aria-labelledby={`calendar-day-header-${day.localDate}`}
                className={
                  day.isToday
                    ? `${styles.dayColumn} ${styles.currentDay}`
                    : styles.dayColumn
                }
                data-current-day={day.isToday ? "true" : "false"}
                data-testid={`calendar-day-${day.localDate}`}
                key={day.localDate}
              >
                <div
                  className={styles.daySlots}
                  data-testid="calendar-day"
                  style={{ gridTemplateRows }}
                >
                  {hasCompactBookings ? (
                    <span
                      aria-hidden="true"
                      className={styles.edgeLabelBand}
                      data-edge="start"
                      data-testid="calendar-edge-label-band"
                      style={{ gridRow: 1 }}
                    />
                  ) : null}
                  {layout.rows.map((row, rowIndex) => {
                    const slot = slotByRow.get(rowIndex);
                    const hourBoundary = endsAtHour(row.minuteOfDay);

                    if (slot === undefined) {
                      return (
                        <div
                          className={[
                            styles.slot,
                            styles.unavailableSlot,
                            hourBoundary ? styles.hourBoundary : ""
                          ].join(" ")}
                          data-hour-boundary={hourBoundary ? "true" : "false"}
                          data-testid="calendar-gap"
                          key={row.id}
                          style={{
                            gridRow: rowIndex + 1 + edgeRowOffset
                          }}
                        />
                      );
                    }

                    const isPartialOffice =
                      slot.isOffice &&
                      (slot.officeStartPercent > 0 ||
                        slot.officeEndPercent < 100);
                    const elapsed = elapsedState(slot.elapsedPercent);
                    return (
                      <div
                        className={[
                          styles.slot,
                          !slot.isOffice
                            ? styles.nonOfficeSlot
                            : isPartialOffice
                              ? styles.partialOfficeSlot
                              : "",
                          hourBoundary ? styles.hourBoundary : ""
                        ].join(" ")}
                        data-elapsed={elapsed}
                        data-hour-boundary={hourBoundary ? "true" : "false"}
                        data-office={slot.isOffice ? "true" : "false"}
                        data-testid="calendar-slot"
                        data-slot-id={slot.id}
                        key={slot.id}
                        style={
                          {
                            gridRow: rowIndex + 1 + edgeRowOffset,
                            "--office-start": `${slot.officeStartPercent}%`,
                            "--office-end": `${slot.officeEndPercent}%`
                          } as CSSProperties
                        }
                      >
                        {slot.elapsedPercent > 0 ? (
                          <span
                            aria-hidden="true"
                            className={styles.elapsedCoverage}
                            data-testid="elapsed-coverage"
                            style={
                              {
                                "--elapsed-coverage": `${slot.elapsedPercent}%`
                              } as CSSProperties
                            }
                          />
                        ) : null}
                        {slot.offsetLabel === undefined ? null : (
                          <small className={styles.offsetLabel}>
                            {slot.offsetLabel}
                          </small>
                        )}
                        {slot.bookingStartAt === undefined ||
                        slot.bookingStartLabel === undefined ||
                        onSelectSlot === undefined ? null : (
                          <button
                            aria-label={
                              `Забронювати ${day.fullDateLabel}, ` +
                              slot.bookingStartLabel
                            }
                            className={styles.slotAction}
                            data-booking-slot="true"
                            data-day-index={dayIndex}
                            data-row-index={slot.rowIndex}
                            data-slot-id={slot.id}
                            onClick={(event) =>
                              onSelectSlot(
                                {
                                  slotId: slot.id,
                                  startAt: slot.bookingStartAt!,
                                  startLabel: slot.bookingStartLabel!,
                                  localDate: day.localDate,
                                  fullDateLabel: day.fullDateLabel
                                },
                                event.currentTarget
                              )
                            }
                            onFocus={() => setActiveSlotId(slot.id)}
                            onKeyDown={(event) =>
                              moveSlotFocus(event, dayIndex, slot.rowIndex)
                            }
                            tabIndex={activeSlotId === slot.id ? 0 : -1}
                            type="button"
                          />
                        )}
                      </div>
                    );
                  })}
                  {hasCompactBookings ? (
                    <span
                      aria-hidden="true"
                      className={styles.edgeLabelBand}
                      data-edge="end"
                      data-testid="calendar-edge-label-band"
                      style={{ gridRow: layout.rows.length + 2 }}
                    />
                  ) : null}

                  {bookings.map((booking) => {
                    const isCompact = booking.heightInRows < 1;
                    const appearanceClass = booking.isOwn
                      ? styles.ownBooking
                      : styles.otherBooking;
                    const bookingContent = (
                      <span className={styles.bookingContent}>
                        <strong title={booking.title}>
                          {booking.isRecurring ? (
                            <span
                              aria-hidden="true"
                              style={{ marginRight: "4px" }}
                              title={`Частина повторюваної серії (${(booking.occurrenceIndex ?? 0) + 1} з ${booking.occurrenceCount})`}
                            >
                              ↻
                            </span>
                          ) : null}
                          {booking.title}
                        </strong>
                        {booking.isRecurring ? (
                          <span className={styles.visuallyHidden}>
                            Частина повторюваної серії
                          </span>
                        ) : null}
                        <span
                          className={
                            booking.isOwn ? styles.ownBookingLabel : undefined
                          }
                          title={booking.isOwn ? "Моє" : booking.organizerName}
                        >
                          {booking.isOwn ? (
                            <>
                              <svg
                                aria-hidden="true"
                                focusable="false"
                                viewBox="0 0 16 16"
                              >
                                <path d="m3 8 3 3 7-7" />
                              </svg>
                              Моє
                            </>
                          ) : (
                            booking.organizerName
                          )}
                        </span>
                      </span>
                    );
                    const markerStyle = {
                      gridRow: booking.startRowIndex + 1 + edgeRowOffset,
                      "--booking-offset": `${
                        (SLOT_HEIGHT_PX * booking.startOffsetPercent) / 100
                      }px`,
                      "--booking-height": `${
                        SLOT_HEIGHT_PX * booking.heightInRows
                      }px`
                    } as CSSProperties;
                    const bookingKey =
                      `${booking.bookingId}-${booking.localDate}-` +
                      `${booking.startMinute}`;

                    if (!isCompact) {
                      return (
                        <article
                          aria-label={booking.accessibleLabel}
                          className={`${styles.booking} ${appearanceClass}`}
                          data-booking-id={booking.bookingId}
                          data-display="standard"
                          data-testid="booking-fragment"
                          key={bookingKey}
                          style={markerStyle}
                        >
                          {bookingContent}
                        </article>
                      );
                    }

                    const labelAnchor = booking.continuesAfter
                      ? "end"
                      : "start";
                    return (
                      <Fragment key={bookingKey}>
                        <span
                          aria-hidden="true"
                          className={`${styles.compactBookingMarker} ${appearanceClass}`}
                          data-booking-id={booking.bookingId}
                          data-testid="compact-booking-marker"
                          style={markerStyle}
                        />
                        <article
                          aria-label={booking.accessibleLabel}
                          className={`${styles.booking} ${styles.compactBookingLabel} ${appearanceClass}`}
                          data-booking-id={booking.bookingId}
                          data-display="compact"
                          data-label-anchor={labelAnchor}
                          data-testid="booking-fragment"
                          style={{
                            gridRow:
                              labelAnchor === "end" ? layout.rows.length + 2 : 1
                          }}
                        >
                          {bookingContent}
                        </article>
                      </Fragment>
                    );
                  })}

                  {now === undefined || nowSlot === undefined ? null : (
                    <span
                      className={styles.nowIndicator}
                      data-slot-id={now.slotId}
                      data-testid="now-indicator"
                      style={
                        {
                          gridRow: nowSlot.rowIndex + 1 + edgeRowOffset,
                          "--now-offset": `${
                            (SLOT_HEIGHT_PX * now.offsetPercent) / 100
                          }px`
                        } as CSSProperties
                      }
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {layout.bookings.length === 0 ? (
          <p className={styles.emptyHint}>Оберіть вільний слот</p>
        ) : null}
      </div>
    </section>
  );
}

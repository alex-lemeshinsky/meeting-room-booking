"use client";

import { Fragment, type CSSProperties } from "react";
import { useEffect, useRef } from "react";
import type { CalendarLayout } from "../../lib/calendar/schedule";
import styles from "./calendar.module.css";

const SLOT_HEIGHT_PX = 44;
const EDGE_LABEL_HEIGHT_PX = 40;

interface CalendarGridProps {
  layout: CalendarLayout;
}

function endsAtHour(minuteOfDay: number): boolean {
  return (minuteOfDay + 30) % 60 === 0;
}

export function CalendarGrid({ layout }: CalendarGridProps) {
  const currentDayHeaderRef = useRef<HTMLTimeElement>(null);
  const didRevealCurrentDay = useRef(false);
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

  return (
    <section
      aria-label="Прокручуваний тижневий розклад"
      className={styles.gridShell}
      data-testid="calendar-scroll-region"
      tabIndex={0}
    >
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
          >
            <span>{day.label}</span>
            <small>{day.localDate}</small>
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
          {layout.days.map((day) => {
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
                        data-hour-boundary={hourBoundary ? "true" : "false"}
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
                        {slot.offsetLabel === undefined ? null : (
                          <small className={styles.offsetLabel}>
                            {slot.offsetLabel}
                          </small>
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
                        <strong title={booking.title}>{booking.title}</strong>
                        <span
                          title={booking.isOwn ? "Моє" : booking.organizerName}
                        >
                          {booking.isOwn ? "Моє" : booking.organizerName}
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

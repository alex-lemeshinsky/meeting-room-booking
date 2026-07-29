import { Fragment, type CSSProperties } from "react";
import type { CalendarLayout } from "../../lib/calendar/schedule";
import styles from "./calendar.module.css";

const SLOT_HEIGHT_PX = 44;
const EDGE_LABEL_HEIGHT_PX = 40;

interface CalendarGridProps {
  layout: CalendarLayout;
}

export function CalendarGrid({ layout }: CalendarGridProps) {
  const gridTemplateRows =
    `${EDGE_LABEL_HEIGHT_PX}px ` +
    `repeat(${layout.rows.length}, ${SLOT_HEIGHT_PX}px) ` +
    `${EDGE_LABEL_HEIGHT_PX}px`;

  return (
    <section className={styles.gridShell} aria-label="Тижневий розклад">
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
          <span
            className={styles.edgeLabelBand}
            data-edge="start"
            style={{ gridRow: 1 }}
          />
          {layout.rows.map((row, rowIndex) => (
            <span
              data-testid="calendar-row-label"
              key={row.id}
              style={{ gridRow: rowIndex + 2 }}
            >
              {row.label}
              {row.offsetLabel === undefined ? null : ` ${row.offsetLabel}`}
            </span>
          ))}
          <span
            className={styles.edgeLabelBand}
            data-edge="end"
            style={{ gridRow: layout.rows.length + 2 }}
          />
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
                  <span
                    aria-hidden="true"
                    className={styles.edgeLabelBand}
                    data-edge="start"
                    style={{ gridRow: 1 }}
                  />
                  {layout.rows.map((row, rowIndex) => {
                    const slot = slotByRow.get(rowIndex);

                    if (slot === undefined) {
                      return (
                        <div
                          className={`${styles.slot} ${styles.unavailableSlot}`}
                          data-testid="calendar-gap"
                          key={row.id}
                          style={{ gridRow: rowIndex + 2 }}
                        />
                      );
                    }

                    const isPartialOffice =
                      slot.isOffice &&
                      (slot.officeStartPercent > 0 ||
                        slot.officeEndPercent < 100);
                    return (
                      <div
                        className={
                          !slot.isOffice
                            ? `${styles.slot} ${styles.nonOfficeSlot}`
                            : isPartialOffice
                              ? `${styles.slot} ${styles.partialOfficeSlot}`
                              : styles.slot
                        }
                        data-testid="calendar-slot"
                        data-slot-id={slot.id}
                        key={slot.id}
                        style={
                          {
                            gridRow: rowIndex + 2,
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
                  <span
                    aria-hidden="true"
                    className={styles.edgeLabelBand}
                    data-edge="end"
                    style={{ gridRow: layout.rows.length + 2 }}
                  />

                  {bookings.map((booking) => {
                    const isCompact = booking.heightInRows < 1;
                    const appearanceClass = booking.isOwn
                      ? styles.ownBooking
                      : styles.otherBooking;
                    const bookingContent = (
                      <span className={styles.bookingContent}>
                        <strong>{booking.title}</strong>
                        <span>
                          {booking.isOwn ? "Моє" : booking.organizerName}
                        </span>
                      </span>
                    );
                    const markerStyle = {
                      gridRow: booking.startRowIndex + 2,
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
                          gridRow: nowSlot.rowIndex + 2,
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

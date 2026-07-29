import type { CSSProperties } from "react";
import type { CalendarLayout } from "../../lib/calendar/schedule";
import styles from "./calendar.module.css";

interface CalendarGridProps {
  layout: CalendarLayout;
}

export function CalendarGrid({ layout }: CalendarGridProps) {
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
        >
          {layout.rows.map((row) => (
            <span data-testid="calendar-row-label" key={row.id}>
              {row.label}
              {row.offsetLabel === undefined ? null : ` ${row.offsetLabel}`}
            </span>
          ))}
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
                  style={{
                    gridTemplateRows: `repeat(${layout.rows.length}, 44px)`
                  }}
                >
                  {layout.rows.map((row, rowIndex) => {
                    const slot = slotByRow.get(rowIndex);

                    if (slot === undefined) {
                      return (
                        <div
                          className={`${styles.slot} ${styles.unavailableSlot}`}
                          data-testid="calendar-gap"
                          key={row.id}
                          style={{ gridRow: rowIndex + 1 }}
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
                            gridRow: rowIndex + 1,
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

                  {bookings.map((booking) => {
                    const isCompact = booking.heightInRows < 1;

                    return (
                      <article
                        aria-label={booking.accessibleLabel}
                        className={
                          booking.isOwn
                            ? `${styles.booking} ${styles.ownBooking}`
                            : `${styles.booking} ${styles.otherBooking}`
                        }
                        data-booking-id={booking.bookingId}
                        data-display={isCompact ? "compact" : "standard"}
                        data-label-anchor={
                          isCompact
                            ? booking.continuesAfter
                              ? "end"
                              : "start"
                            : undefined
                        }
                        data-testid="booking-fragment"
                        key={`${booking.bookingId}-${booking.localDate}-${booking.startMinute}`}
                        style={
                          {
                            gridRow: booking.startRowIndex + 1,
                            "--booking-offset": `${
                              (44 * booking.startOffsetPercent) / 100
                            }px`,
                            "--booking-height": `${44 * booking.heightInRows}px`
                          } as CSSProperties
                        }
                      >
                        <span className={styles.bookingContent}>
                          <strong>{booking.title}</strong>
                          <span>
                            {booking.isOwn ? "Моє" : booking.organizerName}
                          </span>
                        </span>
                      </article>
                    );
                  })}

                  {now === undefined || nowSlot === undefined ? null : (
                    <span
                      className={styles.nowIndicator}
                      data-slot-id={now.slotId}
                      data-testid="now-indicator"
                      style={
                        {
                          gridRow: nowSlot.rowIndex + 1,
                          "--now-offset": `${(44 * now.offsetPercent) / 100}px`
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

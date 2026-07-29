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
            dateTime={day.localDate}
            key={day.localDate}
          >
            <span>{day.label}</span>
            <small>{day.localDate}</small>
          </time>
        ))}
      </div>

      <div className={styles.gridBody}>
        <div className={styles.timeAxis} aria-hidden="true">
          {buildTimeLabels(
            layout.range.startMinute,
            layout.range.endMinute
          ).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className={styles.dayColumns}>
          {layout.days.map((day) => {
            const bookings = layout.bookings.filter(
              (booking) => booking.localDate === day.localDate
            );
            const now =
              layout.now?.localDate === day.localDate ? layout.now : undefined;
            const nowSlotIndex =
              now === undefined
                ? -1
                : day.slots.findIndex((slot) => slot.id === now.slotId);

            return (
              <section
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
                    gridTemplateRows: `repeat(${day.slots.length}, 44px)`
                  }}
                >
                  {day.slots.map((slot, index) => (
                    <div
                      className={
                        slot.isOffice
                          ? styles.slot
                          : `${styles.slot} ${styles.nonOfficeSlot}`
                      }
                      data-testid="calendar-slot"
                      data-slot-id={slot.id}
                      key={slot.id}
                      style={{ gridRow: index + 1 }}
                    >
                      {slot.offsetLabel === undefined ? null : (
                        <small className={styles.offsetLabel}>
                          {slot.offsetLabel}
                        </small>
                      )}
                    </div>
                  ))}

                  {bookings.map((booking) => (
                    <article
                      className={
                        booking.isOwn
                          ? `${styles.booking} ${styles.ownBooking}`
                          : `${styles.booking} ${styles.otherBooking}`
                      }
                      data-booking-id={booking.bookingId}
                      data-testid="booking-fragment"
                      key={`${booking.bookingId}-${booking.localDate}-${booking.startMinute}`}
                      style={{
                        gridRow: `${booking.startSlotIndex + 1} / span ${
                          booking.slotSpan
                        }`
                      }}
                    >
                      <strong>{booking.title}</strong>
                      <span>
                        {booking.isOwn ? "Моє" : booking.organizerName}
                      </span>
                    </article>
                  ))}

                  {now === undefined || nowSlotIndex < 0 ? null : (
                    <span
                      className={styles.nowIndicator}
                      data-slot-id={now.slotId}
                      data-testid="now-indicator"
                      style={
                        {
                          gridRow: nowSlotIndex + 1,
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

function buildTimeLabels(startMinute: number, endMinute: number): string[] {
  const labels: string[] = [];

  for (let minute = startMinute; minute < endMinute; minute += 30) {
    const hour = Math.floor(minute / 60)
      .toString()
      .padStart(2, "0");
    const minuteWithinHour = (minute % 60).toString().padStart(2, "0");
    labels.push(`${hour}:${minuteWithinHour}`);
  }

  return labels;
}

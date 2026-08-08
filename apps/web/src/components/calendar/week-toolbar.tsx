"use client";

import {
  getCurrentLocalWeekStart,
  shiftLocalWeekStart
} from "@mrb/time/calendar";
import styles from "./calendar.module.css";

interface WeekToolbarProps {
  weekStart: string;
  timezone: string;
  weekStartsOn: number;
  onWeekChange: (weekStart: string) => void;
}

export function WeekToolbar({
  weekStart,
  timezone,
  weekStartsOn,
  onWeekChange
}: WeekToolbarProps) {
  return (
    <nav className={styles.toolbar} aria-label="Навігація тижнями">
      <button
        aria-label="Попередній тиждень"
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(
            shiftLocalWeekStart(weekStart, timezone, -1, weekStartsOn)
          )
        }
      >
        <span aria-hidden="true" className={styles.desktopWeekActionLabel}>
          Попередній тиждень
        </span>
        <span aria-hidden="true" className={styles.mobileWeekActionLabel}>
          ←
        </span>
      </button>
      <button
        aria-label="Поточний тиждень"
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(getCurrentLocalWeekStart(timezone, weekStartsOn))
        }
      >
        <span aria-hidden="true" className={styles.desktopWeekActionLabel}>
          Поточний тиждень
        </span>
        <span aria-hidden="true" className={styles.mobileWeekActionLabel}>
          Сьогодні
        </span>
      </button>
      <button
        aria-label="Наступний тиждень"
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(
            shiftLocalWeekStart(weekStart, timezone, 1, weekStartsOn)
          )
        }
      >
        <span aria-hidden="true" className={styles.desktopWeekActionLabel}>
          Наступний тиждень
        </span>
        <span aria-hidden="true" className={styles.mobileWeekActionLabel}>
          →
        </span>
      </button>
    </nav>
  );
}

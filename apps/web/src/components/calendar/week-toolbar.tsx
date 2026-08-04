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
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(
            shiftLocalWeekStart(weekStart, timezone, -1, weekStartsOn)
          )
        }
      >
        Попередній тиждень
      </button>
      <button
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(getCurrentLocalWeekStart(timezone, weekStartsOn))
        }
      >
        Поточний тиждень
      </button>
      <button
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(
            shiftLocalWeekStart(weekStart, timezone, 1, weekStartsOn)
          )
        }
      >
        Наступний тиждень
      </button>
    </nav>
  );
}

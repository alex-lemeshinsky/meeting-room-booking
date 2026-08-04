"use client";

import {
  getCurrentLocalWeekStart,
  shiftLocalWeekStart
} from "@mrb/time/calendar";
import styles from "./calendar.module.css";

interface WeekToolbarProps {
  weekStart: string;
  timezone: string;
  onWeekChange: (weekStart: string) => void;
}

export function WeekToolbar({
  weekStart,
  timezone,
  onWeekChange
}: WeekToolbarProps) {
  return (
    <nav className={styles.toolbar} aria-label="Навігація тижнями">
      <button
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(shiftLocalWeekStart(weekStart, timezone, -1, 1))
        }
      >
        Попередній тиждень
      </button>
      <button
        className={styles.secondaryAction}
        type="button"
        onClick={() => onWeekChange(getCurrentLocalWeekStart(timezone, 1))}
      >
        Поточний тиждень
      </button>
      <button
        className={styles.secondaryAction}
        type="button"
        onClick={() =>
          onWeekChange(shiftLocalWeekStart(weekStart, timezone, 1, 1))
        }
      >
        Наступний тиждень
      </button>
    </nav>
  );
}

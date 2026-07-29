import styles from "./schedule.module.css";

export default function ScheduleLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Завантажуємо розклад кімнати"
      className={styles.schedulePage}
    >
      <div className={styles.backLinkSkeleton} aria-hidden="true" />
      <div className={styles.roomContextSkeleton} aria-hidden="true" />
      <div className={styles.calendarSkeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

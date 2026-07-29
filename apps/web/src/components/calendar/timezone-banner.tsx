import styles from "./calendar.module.css";

export function TimezoneBanner({ timezone }: { timezone: string }) {
  return (
    <aside className={styles.timezoneBanner}>
      <strong>Ваш часовий пояс: {timezone}</strong>
      <span>Офіс: Europe/Kyiv</span>
      <span>Робочі години перевіряються за київським часом.</span>
    </aside>
  );
}

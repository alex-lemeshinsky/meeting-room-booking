import Link from "next/link";
import styles from "./schedule.module.css";

export default function ScheduleNotFound() {
  return (
    <section className={styles.routeError}>
      <h1>Кімнату не знайдено</h1>
      <p>Можливо, кімнату видалили або посилання застаріло.</p>
      <Link className={styles.primaryLink} href="/rooms">
        Повернутися до кімнат
      </Link>
    </section>
  );
}

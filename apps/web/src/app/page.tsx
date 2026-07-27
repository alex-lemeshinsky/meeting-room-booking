import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>ClearSpace foundation</p>
        <h1>Meeting Rooms</h1>
        <p className={styles.description}>
          Вебзастосунок готується до першого функціонального етапу.
        </p>
        <a className={styles.primaryAction} href="/api/v1/health/live">
          Перевірити API
        </a>
      </section>
    </main>
  );
}

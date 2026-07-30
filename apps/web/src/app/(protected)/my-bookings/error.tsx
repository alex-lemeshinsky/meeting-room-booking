"use client";

import styles from "../protected.module.css";

export default function MyBookingsError({
  reset
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  return (
    <section className={styles.errorState} role="alert">
      <h1>Не вдалося завантажити бронювання</h1>
      <p>Перевірте з’єднання та спробуйте ще раз.</p>
      <button className={styles.retryButton} onClick={reset} type="button">
        Спробувати ще
      </button>
    </section>
  );
}

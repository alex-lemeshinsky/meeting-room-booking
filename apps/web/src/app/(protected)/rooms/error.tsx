"use client";

import styles from "../protected.module.css";

export default function RoomsError({
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section className={styles.errorState} role="alert">
      <h1>Не вдалося завантажити кімнати</h1>
      <p>
        Спробуйте ще раз. Якщо помилка повторюється, зверніться до
        адміністратора.
      </p>
      <button
        className={styles.retryButton}
        onClick={() => reset()}
        type="button"
      >
        Спробувати ще
      </button>
    </section>
  );
}

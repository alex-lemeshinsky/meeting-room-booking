"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./schedule.module.css";

export default function ScheduleError({
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter();

  return (
    <section className={styles.routeError} role="alert">
      <h1>Не вдалося завантажити розклад кімнати</h1>
      <p>
        Спробуйте ще раз. Якщо помилка повторюється, поверніться до списку
        кімнат.
      </p>
      <div className={styles.routeActions}>
        <button
          onClick={() => {
            router.refresh();
            reset();
          }}
          type="button"
        >
          Спробувати ще
        </button>
        <Link href="/rooms">До списку кімнат</Link>
      </div>
    </section>
  );
}

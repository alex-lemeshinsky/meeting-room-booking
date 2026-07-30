import styles from "../protected.module.css";

export default function MyBookingsLoading() {
  return (
    <section className={styles.roomsPage} role="status">
      <div className={styles.pageIntro}>
        <p className={styles.eyebrow}>Ваші зустрічі</p>
        <h1>Мої бронювання</h1>
        <p>Завантажуємо бронювання…</p>
      </div>
      <div className={styles.skeletonList} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className={styles.skeletonRow} key={index} />
        ))}
      </div>
    </section>
  );
}

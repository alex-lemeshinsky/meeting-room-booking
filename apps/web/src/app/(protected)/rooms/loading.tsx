import styles from "../protected.module.css";

export default function RoomsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Завантажуємо кімнати"
      className={styles.roomsPage}
    >
      <div className={styles.pageIntro}>
        <p className={styles.eyebrow}>Простори для зустрічей</p>
        <h1>Кімнати</h1>
      </div>
      <div className={styles.skeletonList}>
        {Array.from({ length: 6 }, (_, index) => (
          <div aria-hidden="true" className={styles.skeletonRow} key={index} />
        ))}
      </div>
    </section>
  );
}

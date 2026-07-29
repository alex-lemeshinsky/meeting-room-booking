import Link from "next/link";
import styles from "./room-not-found-state.module.css";

interface RoomNotFoundStateProps {
  headingLevel?: 1 | 2;
}

export function RoomNotFoundState({
  headingLevel = 1
}: RoomNotFoundStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section
      aria-labelledby="room-not-found-title"
      className={styles.roomNotFound}
    >
      <Heading id="room-not-found-title">Кімнату не знайдено</Heading>
      <p>Можливо, кімнату видалили або посилання застаріло.</p>
      <Link className={styles.primaryLink} href="/rooms">
        Повернутися до кімнат
      </Link>
    </section>
  );
}

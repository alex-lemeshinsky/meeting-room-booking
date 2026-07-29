import Link from "next/link";
import type { RoomsResponse } from "../../lib/api/contracts";
import styles from "../../app/(protected)/protected.module.css";

interface RoomListProps {
  rooms: RoomsResponse["rooms"];
}

function capacityLabel(capacity: number) {
  return capacity === 1 ? "1 місце" : `${capacity} місць`;
}

export function RoomList({ rooms }: RoomListProps) {
  if (!rooms.length) {
    return (
      <section
        className={styles.emptyState}
        aria-labelledby="rooms-empty-title"
      >
        <h2 id="rooms-empty-title">Кімнат поки немає</h2>
        <p>Коли кімнати стануть доступними, вони з’являться тут.</p>
      </section>
    );
  }

  return (
    <ul className={styles.roomList} aria-label="Переговорні кімнати">
      {rooms.map((room) => (
        <li className={styles.roomCard} key={room.id}>
          <Link
            aria-label={`Відкрити розклад кімнати ${room.name}`}
            className={styles.roomLink}
            href={`/rooms/${room.id}`}
          >
            <h2>{room.name}</h2>
            <dl className={styles.roomDetails}>
              <div>
                <dt>Поверх</dt>
                <dd>{room.floor} поверх</dd>
              </div>
              <div>
                <dt>Місткість</dt>
                <dd>{capacityLabel(room.capacity)}</dd>
              </div>
            </dl>
            <span className={styles.roomAction} aria-hidden="true">
              Переглянути розклад
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

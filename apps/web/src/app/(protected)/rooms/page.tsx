import { redirect } from "next/navigation";
import { RoomList } from "../../../components/rooms/room-list";
import { UnauthenticatedError } from "../../../lib/api/server";
import { getRooms } from "../../../lib/auth/session";
import styles from "../protected.module.css";

export default async function RoomsPage() {
  try {
    const { rooms } = await getRooms();

    return (
      <section className={styles.roomsPage} aria-labelledby="rooms-title">
        <div className={styles.pageIntro}>
          <p className={styles.eyebrow}>Простори для зустрічей</p>
          <h1 id="rooms-title">Кімнати</h1>
          <p>Оберіть переговорну кімнату для наступної зустрічі.</p>
        </div>
        <RoomList rooms={rooms} />
      </section>
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }
}

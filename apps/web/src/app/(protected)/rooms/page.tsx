import { redirect } from "next/navigation";
import { RoomCapacityFilter } from "../../../components/rooms/room-capacity-filter";
import { RoomList } from "../../../components/rooms/room-list";
import { UnauthenticatedError } from "../../../lib/api/server";
import { getRooms } from "../../../lib/auth/session";
import { parseMinCapacity } from "../../../lib/rooms/capacity-filter";
import styles from "../protected.module.css";

interface RoomsPageProps {
  searchParams: Promise<{ minCapacity?: string | string[] }>;
}

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  try {
    const query = await searchParams;
    const capacityFilter = parseMinCapacity(query.minCapacity);
    const minCapacity =
      capacityFilter.kind === "valid" ? capacityFilter.minCapacity : undefined;
    const { rooms } = await getRooms(minCapacity);

    return (
      <section className={styles.roomsPage} aria-labelledby="rooms-title">
        <div className={styles.pageIntro}>
          <p className={styles.eyebrow}>Простори для зустрічей</p>
          <h1 id="rooms-title">Переговорні кімнати</h1>
          <p>Оберіть переговорну кімнату для наступної зустрічі.</p>
        </div>
        <RoomCapacityFilter state={capacityFilter} />
        <RoomList isFiltered={capacityFilter.kind === "valid"} rooms={rooms} />
      </section>
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }
}

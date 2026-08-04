import { isValidTimezone, snapToLocalWeekStart } from "@mrb/time/calendar";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ScheduleCalendar } from "../../../../components/calendar/schedule-calendar";
import { UnauthenticatedError } from "../../../../lib/api/server";
import { getCurrentSession, getRoom } from "../../../../lib/auth/session";
import { TIMEZONE_COOKIE } from "../../../../lib/calendar/timezone";
import styles from "./schedule.module.css";

type SchedulePageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
};

export function normalizeScheduleWeek(
  week: string | string[] | undefined,
  weekStartsOn: number
): string | undefined {
  if (typeof week !== "string") {
    return undefined;
  }

  try {
    return snapToLocalWeekStart(week, "Europe/Kyiv", weekStartsOn);
  } catch {
    return undefined;
  }
}

export function normalizeTimezoneCookie(
  timezone: string | undefined
): string | undefined {
  if (timezone === undefined) {
    return undefined;
  }

  return isValidTimezone(timezone) ? timezone : undefined;
}

function capacityLabel(capacity: number): string {
  return capacity === 1 ? "1 місце" : `${capacity} місць`;
}

export default async function SchedulePage({
  params,
  searchParams
}: SchedulePageProps) {
  const { roomId } = await params;
  let room;

  try {
    room = await getRoom(roomId);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }

  if (room === undefined) {
    notFound();
  }

  const [query, cookieStore, { user }] = await Promise.all([
    searchParams,
    cookies(),
    getCurrentSession()
  ]);
  const initialWeekStart = normalizeScheduleWeek(query.week, user.weekStartsOn);
  const initialTimezone = normalizeTimezoneCookie(
    cookieStore.get(TIMEZONE_COOKIE)?.value
  );

  return (
    <section className={styles.schedulePage} aria-labelledby="schedule-title">
      <Link className={styles.backLink} href="/rooms">
        <svg
          aria-hidden="true"
          fill="none"
          height="16"
          viewBox="0 0 16 16"
          width="16"
        >
          <path
            d="M10.5 3 5.5 8l5 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
        До списку кімнат
      </Link>

      <header className={styles.roomContext}>
        <h1 id="schedule-title">Розклад кімнати {room.name}</h1>
        <p>
          <span>{room.floor} поверх</span>
          <span>{capacityLabel(room.capacity)}</span>
        </p>
      </header>

      <ScheduleCalendar
        room={room}
        initialWeekStart={initialWeekStart}
        initialTimezone={initialTimezone}
        weekStartsOn={user.weekStartsOn}
      />
    </section>
  );
}

import { isValidTimezone } from "@mrb/time/calendar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MyBookingsPage } from "../../../components/bookings/my-bookings-page";
import { UnauthenticatedError } from "../../../lib/api/server";
import { getCurrentSession, getMyBookings } from "../../../lib/auth/session";
import { TIMEZONE_COOKIE } from "../../../lib/calendar/timezone";

export default async function MyBookingsRoute() {
  try {
    const [initialUpcoming, cookieStore, { user }] = await Promise.all([
      getMyBookings(),
      cookies(),
      getCurrentSession()
    ]);
    const initialTimezone = validTimezone(
      cookieStore.get(TIMEZONE_COOKIE)?.value
    );

    return (
      <MyBookingsPage
        initialUpcoming={initialUpcoming}
        weekStartsOn={user.weekStartsOn}
        {...(initialTimezone === undefined ? {} : { initialTimezone })}
      />
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }
}

function validTimezone(timezone: string | undefined): string | undefined {
  if (timezone === undefined) return undefined;

  return isValidTimezone(timezone) ? timezone : undefined;
}

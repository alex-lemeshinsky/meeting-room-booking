import { redirect } from "next/navigation";
import { WeekStartForm } from "../../../components/settings/week-start-form";
import { UnauthenticatedError } from "../../../lib/api/server";
import { getCurrentSession } from "../../../lib/auth/session";
import styles from "./settings.module.css";

export default async function SettingsRoute() {
  try {
    const { user } = await getCurrentSession();

    return (
      <section aria-labelledby="settings-title" className={styles.settingsPage}>
        <header className={styles.pageHeader}>
          <h1 id="settings-title">Налаштування</h1>
          <p>Особисті налаштування календаря.</p>
        </header>

        <WeekStartForm initialWeekStartsOn={user.weekStartsOn} />
      </section>
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }
}

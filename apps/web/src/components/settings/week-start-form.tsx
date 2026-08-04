"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BrowserApiError } from "../../lib/api/errors";
import { updateWeekStartsOn } from "../../lib/api/me";
import { useToast } from "../shell/toast-provider";
import styles from "./week-start-form.module.css";

const WEEK_DAYS = [
  { value: 1, label: "Понеділок" },
  { value: 2, label: "Вівторок" },
  { value: 3, label: "Середа" },
  { value: 4, label: "Четвер" },
  { value: 5, label: "П’ятниця" },
  { value: 6, label: "Субота" },
  { value: 7, label: "Неділя" }
] as const;

interface WeekStartFormProps {
  initialWeekStartsOn: number;
}

export function WeekStartForm({ initialWeekStartsOn }: WeekStartFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(undefined);

    try {
      await updateWeekStartsOn(weekStartsOn);
      showToast({
        message: "Перший день тижня збережено.",
        type: "success"
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof BrowserApiError
          ? error.message
          : "Не вдалося зберегти налаштування. Спробуйте ще раз."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="week-starts-on">
          Перший день тижня
        </label>
        <select
          aria-describedby={
            errorMessage === undefined ? undefined : "week-starts-on-error"
          }
          aria-invalid={errorMessage === undefined ? undefined : true}
          className={styles.select}
          disabled={isSaving}
          id="week-starts-on"
          name="weekStartsOn"
          onChange={(event) => setWeekStartsOn(Number(event.target.value))}
          value={weekStartsOn}
        >
          {WEEK_DAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
        <p className={styles.hint}>
          Календар починатиме тиждень із вибраного дня. Час наявних бронювань не
          змінюється.
        </p>
      </div>

      {errorMessage === undefined ? null : (
        <p className={styles.error} id="week-starts-on-error" role="alert">
          {errorMessage}
        </p>
      )}

      <button className={styles.submit} disabled={isSaving} type="submit">
        {isSaving ? "Зберігаємо…" : "Зберегти"}
      </button>
    </form>
  );
}

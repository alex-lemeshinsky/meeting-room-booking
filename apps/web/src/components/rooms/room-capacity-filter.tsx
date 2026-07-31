import Link from "next/link";
import type { CapacityFilterState } from "../../lib/rooms/capacity-filter";
import styles from "../../app/(protected)/protected.module.css";

const ERROR_ID = "minimum-capacity-error";

interface RoomCapacityFilterProps {
  state: CapacityFilterState;
}

export function RoomCapacityFilter({ state }: RoomCapacityFilterProps) {
  const error = state.kind === "invalid" ? state.error : undefined;

  return (
    <form action="/rooms" className={styles.roomFilter} method="get" noValidate>
      <div className={styles.roomFilterField}>
        <label htmlFor="minimum-capacity">Мінімальна місткість</label>
        <input
          aria-describedby={error ? ERROR_ID : undefined}
          aria-invalid={error ? "true" : undefined}
          defaultValue={state.inputValue}
          id="minimum-capacity"
          min="1"
          name="minCapacity"
          step="1"
          type="number"
        />
        {error ? (
          <p className={styles.roomFilterError} id={ERROR_ID} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={styles.roomFilterActions}>
        <button className={styles.roomFilterSubmit} type="submit">
          Застосувати
        </button>
        {state.kind === "absent" ? null : (
          <Link className={styles.roomFilterReset} href="/rooms">
            Скинути фільтр
          </Link>
        )}
      </div>
    </form>
  );
}

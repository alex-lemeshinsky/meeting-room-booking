import { RegisterForm } from "../../../components/auth/register-form";
import styles from "../auth.module.css";

export default function RegisterPage() {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="register-title">
        <div className={styles.brand}>
          <span className={styles.monogram} aria-hidden="true">
            MR
          </span>
          <span>Meeting Rooms</span>
        </div>
        <h1 className={styles.title} id="register-title">
          Створити обліковий запис
        </h1>
        <p className={styles.description}>
          Бронюйте переговорні кімнати в одному місці.
        </p>
        <RegisterForm />
      </section>
    </main>
  );
}

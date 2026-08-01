import { Suspense } from "react";
import { EmailVerificationCard } from "../../../components/auth/email-verification-card";
import styles from "../auth.module.css";

export default function VerifyEmailPage() {
  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="verify-email-title">
        <div className={styles.brand}>
          <span className={styles.monogram} aria-hidden="true">
            MR
          </span>
          <span>Meeting Rooms</span>
        </div>
        <h1 className={styles.title} id="verify-email-title">
          Підтвердження email
        </h1>
        <Suspense
          fallback={
            <p className={styles.description}>
              Завантажуємо сторінку підтвердження…
            </p>
          }
        >
          <EmailVerificationCard />
        </Suspense>
      </section>
    </main>
  );
}

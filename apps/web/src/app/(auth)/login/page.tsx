import { LoginForm } from "../../../components/auth/login-form";
import styles from "../auth.module.css";

interface LoginPageProps {
  searchParams?: Promise<{
    reason?: string | string[];
    registered?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const registered = params?.registered === "1";
  const sessionEnded = params?.reason === "session";

  return (
    <main className={styles.main}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span className={styles.monogram} aria-hidden="true">
            MR
          </span>
          <span>Meeting Rooms</span>
        </div>
        <h1 className={styles.title} id="login-title">
          Увійти
        </h1>
        <p className={styles.description}>
          Використайте свій робочий обліковий запис.
        </p>
        <LoginForm registered={registered} sessionEnded={sessionEnded} />
      </section>
    </main>
  );
}

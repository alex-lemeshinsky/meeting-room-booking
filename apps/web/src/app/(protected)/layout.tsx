import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedHeader } from "../../components/shell/protected-header";
import { QueryProvider } from "../../components/providers/query-provider";
import { ToastProvider } from "../../components/shell/toast-provider";
import { UnauthenticatedError } from "../../lib/api/server";
import { SESSION_COOKIE } from "../../lib/auth/cookies";
import { getCurrentSession } from "../../lib/auth/session";
import styles from "./protected.module.css";

export default async function ProtectedLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();

  if (!cookieStore.has(SESSION_COOKIE)) {
    redirect("/login?reason=session");
  }

  try {
    const { user } = await getCurrentSession();

    return (
      <QueryProvider>
        <ToastProvider>
          <div className={styles.appShell}>
            <ProtectedHeader userName={user.name} />
            <main className={styles.main}>{children}</main>
          </div>
        </ToastProvider>
      </QueryProvider>
    );
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?reason=session");
    }

    throw error;
  }
}

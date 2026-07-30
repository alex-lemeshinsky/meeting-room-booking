"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { csrfTokenFromCookie } from "../../lib/auth/csrf";
import styles from "../../app/(protected)/protected.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string>();

  async function logout() {
    setError(undefined);
    setIsPending(true);

    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfTokenFromCookie()
        },
        body: "{}"
      });

      if (!response.ok) {
        throw new Error("Logout request failed.");
      }

      router.replace("/login?loggedOut=1");
      router.refresh();
    } catch {
      setError("Не вдалося вийти. Спробуйте ще раз.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={styles.logoutControl}>
      {error ? <p role="alert">{error}</p> : null}
      <button
        className={styles.logoutButton}
        disabled={isPending}
        onClick={logout}
        type="button"
      >
        {isPending ? "Вихід…" : "Вийти"}
      </button>
    </div>
  );
}

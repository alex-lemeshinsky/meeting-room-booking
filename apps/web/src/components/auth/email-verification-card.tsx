"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifyEmail } from "../../lib/api/email-verification";
import { BrowserApiError } from "../../lib/api/errors";
import styles from "../../app/(auth)/auth.module.css";

type VerificationState =
  | { kind: "ready" }
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; code: "invalid" | "expired" | "used" | "unexpected" };

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

const errorMessages = {
  invalid: "Посилання для підтвердження недійсне.",
  expired: "Термін дії посилання минув.",
  used: "Це посилання вже використано.",
  unexpected: "Не вдалося підтвердити email. Спробуйте ще раз."
} as const;

function initialState(token: string | null): VerificationState {
  return token !== null && tokenPattern.test(token)
    ? { kind: "ready" }
    : { kind: "error", code: "invalid" };
}

function errorCode(
  error: unknown
): Extract<VerificationState, { kind: "error" }>["code"] {
  if (!(error instanceof BrowserApiError)) return "unexpected";

  switch (error.code) {
    case "EMAIL_VERIFICATION_TOKEN_INVALID":
      return "invalid";
    case "EMAIL_VERIFICATION_TOKEN_EXPIRED":
      return "expired";
    case "EMAIL_VERIFICATION_TOKEN_USED":
      return "used";
    default:
      return "unexpected";
  }
}

export function EmailVerificationCard() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token");
  const tokenRef = useRef(
    tokenFromQuery !== null && tokenPattern.test(tokenFromQuery)
      ? tokenFromQuery
      : undefined
  );
  const [state, setState] = useState<VerificationState>(() =>
    initialState(tokenFromQuery)
  );
  const resultRef = useRef<HTMLDivElement | HTMLHeadingElement>(null);
  const isSubmittingRef = useRef(false);
  const resultKind = state.kind === "success" || state.kind === "error";

  useEffect(() => {
    if (resultKind) resultRef.current?.focus();
  }, [resultKind, state.kind === "error" ? state.code : undefined]);

  async function confirmEmail() {
    const token = tokenRef.current;
    if (
      token === undefined ||
      state.kind === "pending" ||
      isSubmittingRef.current
    ) {
      return;
    }

    isSubmittingRef.current = true;
    setState({ kind: "pending" });
    window.history.replaceState(window.history.state, "", "/verify-email");

    try {
      await verifyEmail({ token });
      setState({ kind: "success" });
    } catch (error) {
      setState({ kind: "error", code: errorCode(error) });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  if (state.kind === "ready" || state.kind === "pending") {
    return (
      <div className={styles.verificationContent}>
        <p className={styles.description}>
          Підтвердьте email, щоб створювати бронювання.
        </p>
        <button
          className={styles.primaryAction}
          disabled={state.kind === "pending"}
          onClick={confirmEmail}
          type="button"
        >
          {state.kind === "pending" ? "Підтверджуємо…" : "Підтвердити email"}
        </button>
      </div>
    );
  }

  if (state.kind === "success") {
    return (
      <div className={styles.success} role="status">
        <h2 className={styles.resultHeading} ref={resultRef} tabIndex={-1}>
          Email підтверджено
        </h2>
        <p>Тепер ви можете створювати бронювання.</p>
        <Link className={styles.switchPrompt} href="/login">
          Увійти
        </Link>
      </div>
    );
  }

  return (
    <div
      className={styles.requestError}
      ref={resultRef}
      role="alert"
      tabIndex={-1}
    >
      <p>{errorMessages[state.code]}</p>
      {state.code === "unexpected" ? (
        <button
          className={styles.primaryAction}
          onClick={confirmEmail}
          type="button"
        >
          Спробувати ще раз
        </button>
      ) : (
        <Link className={styles.switchPrompt} href="/login">
          Увійти
        </Link>
      )}
    </div>
  );
}

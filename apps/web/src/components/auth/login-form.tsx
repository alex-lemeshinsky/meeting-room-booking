"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import type { AuthResponse, LoginBody } from "../../lib/api/contracts";
import { browserApi } from "../../lib/api/browser";
import { BrowserApiError } from "../../lib/api/errors";
import styles from "../../app/(auth)/auth.module.css";

interface LoginFormProps {
  registered?: boolean;
}

type LoginValues = LoginBody;
type FieldErrors = Partial<Record<keyof LoginValues, string[]>>;

const fieldNames: (keyof LoginValues)[] = ["email", "password"];

function validate(values: LoginValues): FieldErrors {
  return {
    ...(values.email.trim() ? {} : { email: ["Вкажіть email."] }),
    ...(values.password ? {} : { password: ["Вкажіть пароль."] })
  };
}

export function LoginForm({ registered = false }: LoginFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<LoginValues>({
    email: "",
    password: ""
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fieldRefs = { email: emailRef, password: passwordRef };

  function updateValue(field: keyof LoginValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validate(values);
    const firstInvalidField = fieldNames.find((field) => clientErrors[field]);

    if (firstInvalidField) {
      setFieldErrors(clientErrors);
      fieldRefs[firstInvalidField].current?.focus();
      return;
    }

    setFieldErrors({});
    setRequestError(undefined);
    setIsPending(true);

    try {
      await browserApi<AuthResponse>("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      router.replace("/rooms");
      router.refresh();
    } catch (error) {
      if (
        error instanceof BrowserApiError &&
        Object.keys(error.fields).length
      ) {
        const serverErrors = error.fields as FieldErrors;
        setFieldErrors(serverErrors);
        const firstServerField = fieldNames.find(
          (field) => serverErrors[field]?.length
        );
        fieldRefs[firstServerField ?? "email"].current?.focus();
      } else {
        setRequestError(
          error instanceof BrowserApiError &&
            error.code === "INVALID_CREDENTIALS"
            ? "Невірний email або пароль."
            : "Не вдалося увійти. Спробуйте ще раз."
        );
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      {registered ? (
        <p className={styles.success}>
          Обліковий запис створено. Тепер увійдіть.
        </p>
      ) : null}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-email">
          Email
        </label>
        <input
          aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
          aria-invalid={fieldErrors.email ? true : undefined}
          autoComplete="email"
          className={styles.input}
          id="login-email"
          name="email"
          onChange={(event) => updateValue("email", event.target.value)}
          ref={emailRef}
          required
          type="email"
          value={values.email}
        />
        {fieldErrors.email ? (
          <p className={styles.fieldError} id="login-email-error">
            {fieldErrors.email.join(" ")}
          </p>
        ) : null}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-password">
          Пароль
        </label>
        <input
          aria-describedby={
            fieldErrors.password ? "login-password-error" : undefined
          }
          aria-invalid={fieldErrors.password ? true : undefined}
          autoComplete="current-password"
          className={styles.input}
          id="login-password"
          name="password"
          onChange={(event) => updateValue("password", event.target.value)}
          ref={passwordRef}
          required
          type="password"
          value={values.password}
        />
        {fieldErrors.password ? (
          <p className={styles.fieldError} id="login-password-error">
            {fieldErrors.password.join(" ")}
          </p>
        ) : null}
      </div>

      {requestError ? (
        <div className={styles.requestError} role="alert" tabIndex={-1}>
          {requestError}
        </div>
      ) : null}

      <button
        className={styles.primaryAction}
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Вхід…" : "Увійти"}
      </button>
      <p className={styles.switchPrompt}>
        Ще не маєте облікового запису?{" "}
        <Link href="/register">Створити обліковий запис</Link>
      </p>
    </form>
  );
}

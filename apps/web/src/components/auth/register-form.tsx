"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import type { AuthResponse, RegisterBody } from "../../lib/api/contracts";
import { browserApi } from "../../lib/api/browser";
import { BrowserApiError } from "../../lib/api/errors";
import styles from "../../app/(auth)/auth.module.css";

type RegisterValues = RegisterBody;
type FieldErrors = Partial<Record<keyof RegisterValues, string[]>>;

const fieldNames: (keyof RegisterValues)[] = ["name", "email", "password"];

function validate(values: RegisterValues): FieldErrors {
  return {
    ...(values.name.trim() ? {} : { name: ["Вкажіть ім’я."] }),
    ...(values.email.trim() ? {} : { email: ["Вкажіть email."] }),
    ...(values.password ? {} : { password: ["Вкажіть пароль."] })
  };
}

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<RegisterValues>({
    name: "",
    email: "",
    password: ""
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fieldRefs = { name: nameRef, email: emailRef, password: passwordRef };

  function updateValue(field: keyof RegisterValues, value: string) {
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
      await browserApi<AuthResponse>("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      router.replace("/login?registered=1");
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
        fieldRefs[firstServerField ?? "name"].current?.focus();
      } else {
        setRequestError(
          "Не вдалося створити обліковий запис. Спробуйте ще раз."
        );
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="register-name">
          Ім’я
        </label>
        <input
          aria-describedby={
            fieldErrors.name ? "register-name-error" : undefined
          }
          aria-invalid={fieldErrors.name ? true : undefined}
          className={styles.input}
          id="register-name"
          name="name"
          onChange={(event) => updateValue("name", event.target.value)}
          ref={nameRef}
          required
          type="text"
          value={values.name}
        />
        {fieldErrors.name ? (
          <p className={styles.fieldError} id="register-name-error">
            {fieldErrors.name.join(" ")}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="register-email">
          Email
        </label>
        <input
          aria-describedby={
            fieldErrors.email ? "register-email-error" : undefined
          }
          aria-invalid={fieldErrors.email ? true : undefined}
          autoComplete="email"
          className={styles.input}
          id="register-email"
          name="email"
          onChange={(event) => updateValue("email", event.target.value)}
          ref={emailRef}
          required
          type="email"
          value={values.email}
        />
        {fieldErrors.email ? (
          <p className={styles.fieldError} id="register-email-error">
            {fieldErrors.email.join(" ")}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="register-password">
          Пароль
        </label>
        <input
          aria-describedby={
            fieldErrors.password ? "register-password-error" : undefined
          }
          aria-invalid={fieldErrors.password ? true : undefined}
          autoComplete="new-password"
          className={styles.input}
          id="register-password"
          name="password"
          onChange={(event) => updateValue("password", event.target.value)}
          ref={passwordRef}
          required
          type="password"
          value={values.password}
        />
        {fieldErrors.password ? (
          <p className={styles.fieldError} id="register-password-error">
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
        {isPending ? "Створення…" : "Створити обліковий запис"}
      </button>
      <p className={styles.switchPrompt}>
        Уже маєте обліковий запис? <Link href="/login">Увійти</Link>
      </p>
    </form>
  );
}

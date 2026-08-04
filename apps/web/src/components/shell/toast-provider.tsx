"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import styles from "./toast-provider.module.css";

export type ToastType = "info" | "success" | "danger";

export interface ShowToastOptions {
  message: string;
  type?: ToastType | undefined;
}

export interface ToastContextValue {
  showToast: (options: ShowToastOptions) => void;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = "info" }: ShowToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, message, type };

      setToasts((prev) => {
        const next = [...prev, newToast];
        if (next.length > 3) {
          return next.slice(next.length - 3);
        }
        return next;
      });

      setTimeout(() => {
        dismissToast(id);
      }, 8000);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div className={styles.toastContainer} aria-live="polite">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role="status"
                className={`${styles.toast} ${styles[toast.type]}`}
              >
                <span className={styles.message}>{toast.message}</span>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Закрити"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

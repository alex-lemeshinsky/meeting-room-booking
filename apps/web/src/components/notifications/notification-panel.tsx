"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "../../lib/api/notifications";
import type { NotificationItem } from "../../lib/api/contracts";
import styles from "./notification-panel.module.css";

export function formatRelativeTime(
  isoString: string,
  now: Date = new Date()
): string {
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  if (isNaN(diffMs) || diffMs < 0) {
    return "щойно";
  }
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return "щойно";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} хв тому`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} год тому`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн тому`;
}

interface NotificationPanelProps {
  notifications: NotificationItem[];
  isLoading?: boolean;
  onClose?: () => void;
}

export function NotificationPanel({
  notifications,
  isLoading = false,
  onClose
}: NotificationPanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) {
      void markNotificationRead(item.id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      });
    }

    if (onClose) {
      onClose();
    }

    router.push("/my-bookings");
  };

  return (
    <div
      id="notification-panel-popover"
      className={styles.panel}
      role="region"
      aria-label="Панель сповіщень"
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Сповіщення</h2>
      </div>

      {isLoading ? (
        <p className={styles.loadingState}>Завантаження...</p>
      ) : notifications.length === 0 ? (
        <p className={styles.emptyState}>Немає сповіщень</p>
      ) : (
        <ul className={styles.list}>
          {notifications.map((item) => {
            const isUnread = !item.readAt;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.item} ${isUnread ? styles.unreadItem : ""}`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className={styles.itemHeader}>
                    <p className={styles.message}>{item.message}</p>
                    {isUnread && (
                      <span
                        className={styles.unreadDot}
                        aria-label="Непрочитано"
                      />
                    )}
                  </div>
                  <div className={styles.meta}>
                    {item.roomName && (
                      <span className={styles.roomName}>{item.roomName}</span>
                    )}
                    <time dateTime={item.createdAt}>
                      {formatRelativeTime(item.createdAt)}
                    </time>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

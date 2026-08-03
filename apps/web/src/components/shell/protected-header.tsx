"use client";

import Link from "next/link";
import { NotificationBell } from "../notifications/notification-bell";
import { useNotificationStream } from "../../lib/notifications/use-notification-stream";
import { LogoutButton } from "./logout-button";
import { ProtectedNavigation } from "./protected-navigation";
import styles from "./protected-header.module.css";

interface ProtectedHeaderProps {
  userName: string;
}

export function ProtectedHeader({ userName }: ProtectedHeaderProps) {
  useNotificationStream();

  return (
    <header className={styles.header}>
      <Link className={styles.productIdentity} href="/rooms">
        <span aria-hidden="true" className={styles.productMark}>
          MR
        </span>
        <span>Meeting Rooms</span>
      </Link>
      <ProtectedNavigation />
      <div className={styles.userControls}>
        <NotificationBell />
        <span className={styles.userName}>{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}

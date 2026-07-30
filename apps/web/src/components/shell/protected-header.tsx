import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { ProtectedNavigation } from "./protected-navigation";
import styles from "../../app/(protected)/protected.module.css";

interface ProtectedHeaderProps {
  userName: string;
}

export function ProtectedHeader({ userName }: ProtectedHeaderProps) {
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
        <span className={styles.userName}>{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}

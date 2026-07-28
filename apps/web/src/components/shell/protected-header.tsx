import { LogoutButton } from "./logout-button";
import styles from "../../app/(protected)/protected.module.css";

interface ProtectedHeaderProps {
  userName: string;
}

export function ProtectedHeader({ userName }: ProtectedHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.productIdentity}>
        <span aria-hidden="true" className={styles.productMark}>
          MR
        </span>
        <span>Meeting Rooms</span>
      </div>
      <div className={styles.userControls}>
        <span className={styles.userName}>{userName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}

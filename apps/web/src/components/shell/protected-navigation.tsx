"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../../app/(protected)/protected.module.css";

const destinations = [
  { href: "/rooms", label: "Кімнати" },
  { href: "/my-bookings", label: "Мої" }
] as const;

export function ProtectedNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Основна навігація" className={styles.primaryNavigation}>
      {destinations.map((destination) => {
        const isCurrent =
          pathname === destination.href ||
          pathname.startsWith(`${destination.href}/`);

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            href={destination.href}
            key={destination.href}
          >
            {destination.label}
          </Link>
        );
      })}
    </nav>
  );
}

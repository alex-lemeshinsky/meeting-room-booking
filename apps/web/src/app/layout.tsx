import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-body"
});

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  description: "Meeting room booking",
  title: "Meeting Rooms"
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="uk" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}

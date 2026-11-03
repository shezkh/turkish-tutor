import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Turkish Tutor",
  description: "Learn Turkish with Deniz — your AI tutor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

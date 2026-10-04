import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threads Analytics",
  description: "Post performance analysis for a Threads account",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

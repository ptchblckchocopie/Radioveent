import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Late Night Radio",
  description: "A shared room. Same song, same time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

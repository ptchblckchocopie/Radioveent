import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MusicQueue",
  description: "Listen to music together with friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

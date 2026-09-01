import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JMU Parking Tracker",
  description: "See when JMU commuter decks fill up and find the best time to park.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

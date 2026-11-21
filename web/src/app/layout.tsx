import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "LedgerFlow", description: "Financial operations for growing businesses" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "unflat × agents",
  description: "A bank account for AI agents, constrained by expiring mandates.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

